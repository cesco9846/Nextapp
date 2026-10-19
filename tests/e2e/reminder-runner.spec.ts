import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { testRunnerSecret } from "../fixtures/runner";
import { documentSql } from "./documents-helpers";

function signed(
  kind: string,
  stamp = Math.floor(Date.now() / 1000).toString(),
) {
  const nonce = crypto.randomUUID();
  return {
    "x-glow-time": stamp,
    "x-glow-nonce": nonce,
    "x-glow-signature": createHmac("sha256", testRunnerSecret)
      .update(`${kind}\n${stamp}\n${nonce}`)
      .digest("hex"),
  };
}

test("scheduled invocations need a fresh signature and cannot be configured by the caller", async ({
  request,
}) => {
  for (const kind of ["run", "monitor"]) {
    const path = `/api/internal/reminders/${kind}`;
    expect((await request.get(path)).status()).toBe(405);
    for (const authorization of [
      "",
      "Bearer wrong",
      `Bearer ${"d".repeat(64)}`,
    ])
      expect(
        (
          await request.post(path, { headers: { authorization }, data: {} })
        ).status(),
      ).toBe(401);
    const headers = () => signed(kind);
    expect(
      (
        await request.post(path, {
          headers: signed(kind, Math.floor(Date.now() / 1000 - 91).toString()),
          data: {},
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post(path, {
          headers: signed(kind === "run" ? "monitor" : "run"),
          data: {},
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post(path, {
          headers: headers(),
          data: { enabled: true },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(path, { headers: headers(), data: "x".repeat(65) })
      ).status(),
    ).toBe(413);
    const once = headers();
    const response = await request.post(path, { headers: once, data: {} });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    if (kind === "run")
      expect(await response.json()).toEqual({
        mode: "disabled",
        claimed: 0,
        accepted: 0,
      });
    else
      expect(await response.json()).toMatchObject({
        mode: "disabled",
        status: "ok",
      });
    expect(
      (await request.post(path, { headers: once, data: {} })).status(),
    ).toBe(409);
  }
});

test("monitor persists failures with non-success HTTP; loopback can never dispatch to Resend", async ({
  request,
}) => {
  const id = crypto.randomUUID();

  documentSql(
    `update app_private.reminder_settings set enabled=true; insert into app_private.reminder_runs(id,provider,status,finished_at) values('${id}','resend-v1','failed',clock_timestamp());`,
  );
  try {
    const monitor = await request.post("/api/internal/reminders/monitor", {
      headers: signed("monitor"),
      data: {},
    });
    expect(monitor.status()).toBe(503);
    const result = await monitor.json();
    expect(result.status).toBe("degraded");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "worker_failed" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(/email|recipient|token|secret/i);
    expect(
      (
        await request.post("/api/internal/reminders/run", {
          headers: signed("run"),
          data: {},
        })
      ).status(),
    ).toBe(503);
    expect(
      documentSql(
        "select count(*) from app_private.reminder_alerts where kind='worker_failed' and resolved_at is null;",
      ),
    ).toBe("1");
  } finally {
    documentSql(
      `update app_private.reminder_settings set enabled=false; delete from app_private.reminder_runs where id='${id}';`,
    );
    await request.post("/api/internal/reminders/monitor", {
      headers: signed("monitor"),
      data: {},
    });
  }
});
