import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";
import { account, login, origin } from "./helpers";

const bucket = "glow-private";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("File tests require local Supabase");
const admin = createClient<Database>(
  url,
  process.env.TEST_SUPABASE_SERVICE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function image() {
  return sharp({
    create: { width: 128, height: 96, channels: 3, background: "#28664f" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}
async function client(page: Page) {
  const response = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: "Cliente", last_name: "Foto", phone: "", email: "" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}
async function prepare(
  page: Page,
  id: string,
  content: Buffer,
  mime = "image/jpeg",
) {
  const body = {
    request_id: crypto.randomUUID(),
    size_bytes: content.length,
    sha256: hash(content),
    mime_type: mime,
  };
  const response = await page.request.post(`/api/clients/${id}/files`, {
    headers: origin,
    data: body,
  });
  expect(response.status()).toBe(201);
  return {
    ...((await response.json()) as { id: string; upload_path: string }),
    body,
  };
}
async function complete(page: Page, id: string) {
  return page.request.post(`/api/files/${id}/complete`, {
    headers: origin,
    data: {},
  });
}
async function read(page: Page, id: string) {
  return page.request.post(`/api/files/${id}/read`, {
    headers: origin,
    data: {},
  });
}

test("private images are verified, normalized and readable only through an audited short link", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  const id = await client(page);
  const content = await image();
  const file = await prepare(page, id, content);
  // Signed upload tokens would outlive membership/cleanup checks. They must never be minted.
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .createSignedUploadUrl(file.upload_path)
    ).error,
  ).not.toBeNull();
  const retry = await page.request.post(`/api/clients/${id}/files`, {
    headers: origin,
    data: file.body,
  });
  expect((await retry.json()).id).toBe(file.id);
  expect((await complete(page, file.id)).status()).toBe(409);
  expect((await read(page, file.id)).status()).toBe(404);
  const upload = await owner.db.storage
    .from(bucket)
    .upload(file.upload_path, content, {
      contentType: "image/jpeg",
      upsert: false,
    });
  expect(upload.error).toBeNull();
  // Original objects remain inaccessible even to their uploader.
  expect(
    (await owner.db.storage.from(bucket).download(file.upload_path)).error,
  ).not.toBeNull();
  expect(
    (await owner.db.storage.from(bucket).createSignedUrl(file.upload_path, 60))
      .error,
  ).not.toBeNull();
  // Simulate a lost completion response after the verified object was written.
  const staged = await admin
    .from("stored_files")
    .select("object_path")
    .eq("id", file.id)
    .single();
  expect(staged.error).toBeNull();
  const normalized = await sharp(content).rotate().jpeg().toBuffer();
  expect(
    (
      await admin.storage
        .from(bucket)
        .upload(staged.data!.object_path, normalized, {
          contentType: "image/jpeg",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  const results = await Promise.all([
    complete(page, file.id),
    complete(page, file.id),
  ]);
  expect(results.map((result) => result.status())).toEqual([200, 200]);
  const ready = await results[0].json();
  expect(ready).toMatchObject({ state: "ready", width: 96, height: 128 });
  const stored = await admin
    .from("stored_files")
    .select("*")
    .eq("id", file.id)
    .single();
  expect(stored.error).toBeNull();
  const objectPath = stored.data!.object_path;
  expect(
    (
      await owner.db.storage.from(bucket).upload(objectPath, content, {
        contentType: "image/jpeg",
        upsert: true,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await owner.db.storage.from(bucket).upload(file.upload_path, content, {
        contentType: "image/jpeg",
        upsert: true,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (await owner.db.storage.from(bucket).createSignedUrl(objectPath, 60)).error,
  ).not.toBeNull();
  const link = await read(page, file.id);
  expect(link.status()).toBe(200);
  expect(link.headers()["cache-control"]).toContain("no-store");
  const signed = await link.json();
  expect(signed.expires_in).toBe(30);
  const bytes = await page.request.get(signed.url);
  expect(bytes.status()).toBe(200);
  const output = await bytes.body();
  expect(hash(output)).toBe(ready.sha256);
  const metadata = await sharp(output).metadata();
  expect(metadata.exif).toBeUndefined();
  expect(metadata.orientation).toBeUndefined();
  const publicObject = await page.request.get(
    `${url}/storage/v1/object/public/${bucket}/${objectPath}`,
  );
  expect(publicObject.ok()).toBe(false);
  const audit = await owner.db
    .from("audit_log")
    .select("id")
    .eq("resource_id", file.id)
    .eq("action", "file.read");
  expect(audit.data).toHaveLength(1);
  const finalizationAudit = await owner.db
    .from("audit_log")
    .select("actor_id")
    .eq("resource_id", file.id)
    .eq("action", "file.ready");
  expect(finalizationAudit.data).toEqual([{ actor_id: owner.id }]);
  const listed = await page.request.get(`/api/clients/${id}/files`);
  expect(
    (await listed.json()).files.map((entry: { id: string }) => entry.id),
  ).toEqual([file.id]);
  expect(
    (
      await page.request.delete(`/api/files/${file.id}`, { headers: origin })
    ).status(),
  ).toBe(400);
});

test("file validation rejects forged formats, changed content and unauthorized Storage paths", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  const id = await client(page);
  const content = await image();
  const file = await prepare(page, id, content);
  const changed = await page.request.post(`/api/clients/${id}/files`, {
    headers: origin,
    data: { ...file.body, size_bytes: 1 },
  });
  expect(changed.status()).toBe(409);
  const wrongPath = file.upload_path.replace(/\/upload$/, "/elsewhere");
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(wrongPath, content, { contentType: "image/jpeg" })
    ).error,
  ).not.toBeNull();
  const spoofed = await prepare(page, id, content, "image/png");
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(spoofed.upload_path, content, { contentType: "image/png" })
    ).error,
  ).toBeNull();
  expect((await complete(page, spoofed.id)).status()).toBe(422);
  expect((await read(page, spoofed.id)).status()).toBe(404);
  const damaged = await prepare(page, id, content);
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(damaged.upload_path, Buffer.from("not the declared image"), {
          contentType: "image/jpeg",
        })
    ).error,
  ).toBeNull();
  expect((await complete(page, damaged.id)).status()).toBe(422);
  const invalid = await prepare(
    page,
    id,
    Buffer.from("image-shaped metadata is insufficient"),
  );
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(
          invalid.upload_path,
          Buffer.from("image-shaped metadata is insufficient"),
          { contentType: "image/jpeg" },
        )
    ).error,
  ).toBeNull();
  expect((await complete(page, invalid.id)).status()).toBe(422);
  for (const patch of [
    { mime_type: "image/heic" },
    { size_bytes: 10485761 },
    { object_path: "another/file" },
  ]) {
    expect(
      (
        await page.request.post(`/api/clients/${id}/files`, {
          headers: origin,
          data: { ...file.body, request_id: crypto.randomUUID(), ...patch },
        })
      ).status(),
    ).toBe(422);
  }
  expect(
    (
      await page.request.post(`/api/clients/${id}/files`, {
        headers: { Origin: "https://outside.invalid" },
        data: file.body,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.db.rpc("finish_client_file", {
        p_id: file.id,
        p_actor: owner.id,
        p_sha256: hash(content),
        p_size: content.length,
        p_width: 128,
        p_height: 96,
      })
    ).error,
  ).not.toBeNull();
});

test("clinical assignment and membership are rechecked before every new file capability", async ({
  page,
  browser,
}) => {
  const owner = await account();
  const other = await account();
  const staff = await account(false);
  await login(page, owner);
  const id = await client(page);
  const content = await image();
  const file = await prepare(page, id, content);
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(file.upload_path, content, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  expect((await complete(page, file.id)).status()).toBe(200);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, other);
  expect((await read(otherPage, file.id)).status()).toBe(404);
  expect((await complete(otherPage, file.id)).status()).toBe(404);
  expect(
    (await other.db.from("stored_files").select("id").eq("id", file.id)).data,
  ).toEqual([]);
  const invited = await owner.db.rpc("create_team_invitation", {
    p_email: staff.email,
    p_clinical_access: true,
  });
  const token = (invited.data as { token: string }).token;
  expect(
    (
      await staff.db.rpc("accept_team_invitation", {
        p_token: token,
        p_display_name: "Staff Foto",
      })
    ).error,
  ).toBeNull();
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await login(staffPage, staff);
  expect((await read(staffPage, file.id)).status()).toBe(404);
  const assigned = await owner.db.rpc("set_client_assignment", {
    p_client_id: id,
    p_operator_id: staff.id,
    p_assigned: true,
    p_version: 0,
  });
  expect(assigned.error).toBeNull();
  const capability = await read(staffPage, file.id);
  expect(capability.status()).toBe(200);
  const priorLink = (await capability.json()).url;
  const prepared = await prepare(staffPage, id, content);
  expect(
    (
      await owner.db.rpc("set_client_assignment", {
        p_client_id: id,
        p_operator_id: staff.id,
        p_assigned: false,
        p_version: assigned.data!.version,
      })
    ).error,
  ).toBeNull();
  expect((await read(staffPage, file.id)).status()).toBe(404);
  expect(
    (
      await staff.db.storage
        .from(bucket)
        .upload(prepared.upload_path, content, { contentType: "image/jpeg" })
    ).error,
  ).not.toBeNull();
  // Already issued links keep their bounded 30-second lifetime after revocation.
  expect((await staffPage.request.get(priorLink)).status()).toBe(200);
  const member = await owner.db
    .from("users")
    .select("version")
    .eq("id", staff.id)
    .single();
  expect(
    (
      await owner.db.rpc("update_team_member", {
        p_id: staff.id,
        p_version: member.data!.version,
        p_active: false,
        p_clinical_access: true,
      })
    ).error,
  ).toBeNull();
  expect((await read(staffPage, file.id)).status()).toBe(403);
  await otherContext.close();
  await staffContext.close();
});

test("leased cleanup recovers expired uploads and a crash before metadata finalization", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  const id = await client(page);
  const content = await image();
  const pending = await prepare(page, id, content);
  expect(
    (
      await owner.db.storage
        .from(bucket)
        .upload(pending.upload_path, content, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  const row = await admin
    .from("stored_files")
    .select("*")
    .eq("id", pending.id)
    .single();
  expect(row.error).toBeNull();
  // Simulate the server stopping after writing the normalized object, before DB commit.
  expect(
    (
      await admin.storage
        .from(bucket)
        .upload(row.data!.object_path, content, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("stored_files")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", pending.id)
    ).error,
  ).toBeNull();
  expect((await complete(page, pending.id)).status()).toBe(400);
  expect((await read(page, pending.id)).status()).toBe(404);
  const claim = await admin.rpc("claim_file_cleanup", { p_limit: 100 });
  expect(claim.error).toBeNull();
  const ids = (claim.data as { id: string }[]).map((entry) => entry.id);
  expect(ids).toContain(pending.id);
  const concurrent = await admin.rpc("claim_file_cleanup", { p_limit: 100 });
  expect(concurrent.error).toBeNull();
  expect(
    (concurrent.data as { id: string }[]).some((entry) =>
      ids.includes(entry.id),
    ),
  ).toBe(false);
  // Recover an abandoned cleanup lease, then run the actual bounded job twice.
  expect(
    (
      await admin
        .from("stored_files")
        .update({
          cleanup_lease_until: new Date(Date.now() - 1000).toISOString(),
        })
        .in("id", ids)
    ).error,
  ).toBeNull();
  const run = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--use-env-proxy",
          "--import",
          "tsx",
          "scripts/cleanup-files.ts",
          "--local",
        ],
        { env: process.env, encoding: "utf8" },
      ).trim(),
    );
  expect(run().retry).toBe(0);
  const cleaned = await admin
    .from("stored_files")
    .select("state,cleanup_completed_at")
    .eq("id", pending.id)
    .single();
  expect(cleaned.data?.state).toBe("discarded");
  expect(cleaned.data?.cleanup_completed_at).not.toBeNull();
  expect(
    (await admin.storage.from(bucket).download(pending.upload_path)).error,
  ).not.toBeNull();
  expect(
    (await admin.storage.from(bucket).download(row.data!.object_path)).error,
  ).not.toBeNull();
  // A privileged upload can still commit after cleanup acknowledged an expired
  // file. Reconciliation must discover it on the retained discarded record.
  expect(
    (
      await admin.storage
        .from(bucket)
        .upload(row.data!.object_path, content, {
          contentType: "image/jpeg",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  expect(run()).toMatchObject({ claimed: 1, completed: 1, retry: 0 });
  expect(
    (await admin.storage.from(bucket).download(row.data!.object_path)).error,
  ).not.toBeNull();
  expect(run()).toMatchObject({ claimed: 0, completed: 0, retry: 0 });
});
