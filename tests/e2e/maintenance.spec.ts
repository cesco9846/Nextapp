import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { testRunnerSecret } from "../fixtures/runner";
import {
  documentSql,
  issueSignature,
  readSignature,
  signBody,
  documentList,
} from "./documents-helpers";
import { clinicalScenario } from "./clinical-helpers";
import { origin } from "./helpers";
import { intakeAdmin } from "./intake-helpers";

function signed(kind: string, time = Math.floor(Date.now() / 1000)) {
  const stamp = time.toString(),
    nonce = crypto.randomUUID();
  return {
    "x-glow-time": stamp,
    "x-glow-nonce": nonce,
    "x-glow-signature": createHmac("sha256", testRunnerSecret)
      .update(`${kind}\n${stamp}\n${nonce}`)
      .digest("hex"),
  };
}
test("maintenance needs a fresh kind-bound signature, rejects configuration and replays, and does nothing while paused", async ({
  request,
}) => {
  for (const kind of ["documents", "cleanup"]) {
    const path = `/api/internal/maintenance/${kind}`;
    expect((await request.get(path)).status()).toBe(405);
    expect((await request.post(path, { data: {} })).status()).toBe(401);
    for (const headers of [
      signed("run"),
      signed(kind === "documents" ? "cleanup" : "documents"),
      signed(kind, Math.floor(Date.now() / 1000) - 91),
    ])
      expect((await request.post(path, { headers, data: {} })).status()).toBe(
        401,
      );
    expect(
      (
        await request.post(path, {
          headers: signed(kind),
          data: { enabled: true },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(path, {
          headers: signed(kind),
          data: "x".repeat(65),
        })
      ).status(),
    ).toBe(413);
    const headers = signed(kind);
    const response = await request.post(path, { headers, data: {} });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({
      mode: "disabled",
      processed: 0,
      failed: 0,
    });
    expect((await request.post(path, { headers, data: {} })).status()).toBe(
      409,
    );
  }
});

test("scheduled cleanup removes staging while preserving a ready clinical original", async ({
  page,
  request,
}) => {
  const f = await clinicalScenario(page, true);
  const row = await intakeAdmin
    .from("stored_files")
    .select("object_path,upload_path")
    .eq("id", f.label.id)
    .single();
  expect(row.error).toBeNull();
  const before = await intakeAdmin.storage
    .from("glow-private")
    .download(row.data!.object_path);
  expect(before.error).toBeNull();
  const bytes = Buffer.from(await before.data!.arrayBuffer());
  documentSql("update app_private.maintenance_settings set enabled=true;");
  try {
    for (let i = 0; i < 5; i++) {
      const response = await request.post("/api/internal/maintenance/cleanup", {
        headers: signed("cleanup"),
        data: {},
      });
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.failed).toBe(0);
      expect(result.processed).toBeLessThanOrEqual(10);
      if (
        documentSql(
          `select staging_cleaned_at is not null from public.stored_files where id='${f.label.id}';`,
        ) === "t"
      )
        break;
    }
    expect(
      documentSql(
        `select state||':'||(staging_cleaned_at is not null)::text from public.stored_files where id='${f.label.id}';`,
      ),
    ).toBe("ready:true");
    expect(
      (
        await intakeAdmin.storage
          .from("glow-private")
          .download(row.data!.upload_path)
      ).error,
    ).not.toBeNull();
    const after = await intakeAdmin.storage
      .from("glow-private")
      .download(row.data!.object_path);
    expect(after.error).toBeNull();
    expect(Buffer.from(await after.data!.arrayBuffer())).toEqual(bytes);
  } finally {
    documentSql("update app_private.maintenance_settings set enabled=false;");
  }
});

test("scheduled recovery finalizes an uploaded PDF after a crash without another signature or overwriting bytes", async ({
  page,
  request,
}) => {
  const f = await clinicalScenario(page, true);
  const issued = await issueSignature(page, f.appointment.id);
  const review = await readSignature(page, issued.token!);
  documentSql(
    `create function public.test_maintenance_fail() returns trigger language plpgsql as $$ begin if new.appointment_id='${f.appointment.id}' and new.document_state='ready' then raise exception 'SYNTHETIC_FINALIZATION_FAILURE'; end if; return new; end; $$; create trigger test_maintenance_fail before update on public.consents for each row execute function public.test_maintenance_fail();`,
  );
  let id = "";
  try {
    const response = await page.request.post("/api/consent/sign", {
      headers: origin,
      data: signBody(issued.token!, review),
    });
    expect(response.status()).toBe(200);
    id = (await response.json()).receipt.id;
    await expect
      .poll(
        async () =>
          (await documentList(page, f.appointment.id)).documents[0]
            ?.document_state,
        { timeout: 30000 },
      )
      .toBe("failed");
  } finally {
    documentSql(
      "drop trigger test_maintenance_fail on public.consents; drop function public.test_maintenance_fail();",
    );
  }
  const before = documentSql(
    `select o.id::text||':'||o.updated_at::text from storage.objects o where bucket_id='glow-documents' and name like '%/${id}/glow-pdf-v1.pdf';`,
  );
  expect(before).not.toBe("");
  documentSql(
    `update app_private.document_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where consent_id='${id}'; update app_private.maintenance_settings set enabled=true;`,
  );
  try {
    const response = await request.post("/api/internal/maintenance/documents", {
      headers: signed("documents"),
      data: {},
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      mode: "enabled",
      processed: 1,
      failed: 0,
    });
    expect(
      (await documentList(page, f.appointment.id)).documents[0].document_state,
    ).toBe("ready");
    expect(
      documentSql(
        `select o.id::text||':'||o.updated_at::text from storage.objects o where bucket_id='glow-documents' and name like '%/${id}/glow-pdf-v1.pdf';`,
      ),
    ).toBe(before);
    const download = await page.request.post(`/api/consents/${id}/download`, {
      headers: origin,
      data: {},
    });
    expect(download.status()).toBe(200);
    expect((await download.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect(
      documentSql(
        `select count(*) from public.consents where appointment_id='${f.appointment.id}';`,
      ),
    ).toBe("1");
    // The independent kind lease prevents overlap even with valid fresh signatures.
    documentSql(
      "update app_private.maintenance_runs set lease_until=clock_timestamp()+interval '1 minute' where kind='documents';",
    );
    const busy = await request.post("/api/internal/maintenance/documents", {
      headers: signed("documents"),
      data: {},
    });
    expect(await busy.json()).toEqual({
      mode: "busy",
      processed: 0,
      failed: 0,
    });
  } finally {
    documentSql(
      "update app_private.maintenance_settings set enabled=false; update app_private.maintenance_runs set lease_until=null;",
    );
  }
});
