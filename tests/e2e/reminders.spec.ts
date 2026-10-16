import { spawn, execFileSync, spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { documentSql } from "./documents-helpers";
import { intakeAdmin } from "./intake-helpers";
import { fixtureGateway, FixtureProvider } from "./reminder-provider";
import { reminderStore } from "@/reminders/store";
import { runReminderBatch } from "@/reminders/worker";
import type { Claim } from "@/reminders/contracts";
async function scenario(page: Page) {
  const owner = await account();
  await login(page, owner);
  const tenant = (
    await owner.db.from("users").select("tenant_id").eq("id", owner.id).single()
  ).data!.tenant_id;
  documentSql(
    `update public.tenants set reminders_enabled=true where id='${tenant}'; update app_private.reminder_settings set enabled=true,provider='test-v1';`,
  );
  const client = await page.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "Cliente",
      last_name: "Promemoria sintetico",
      email: "reminder-synthetic@example.invalid",
      phone: "",
    },
  });
  expect(client.status()).toBe(201);
  const services = (await owner.db.from("services").select("id").single())
    .data!;
  const location = (await owner.db.from("locations").select("id").single())
    .data!;
  const start = new Date(Date.now() + 25 * 3600000);
  const created = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      client_id: (await client.json()).id,
      service_id: services.id,
      location_id: location.id,
      operator_id: owner.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(created.status()).toBe(201);
  const appointment = await created.json();
  // Advance this synthetic job to due without changing the wall clock for Auth.
  documentSql(
    `update public.messages set scheduled_for=clock_timestamp()-interval '1 minute' where appointment_id='${appointment.id}';`,
  );
  const message = (
    await owner.db
      .from("messages")
      .select("id")
      .eq("appointment_id", appointment.id)
      .single()
  ).data!;
  return {
    owner,
    tenant,
    appointment,
    id: message.id,
    store: reminderStore(intakeAdmin),
    async row() {
      return (
        await owner.db
          .from("messages")
          .select(
            "status,attempts,provider_id,next_attempt_at,failure_code,cancellation_requested_at",
          )
          .eq("id", message.id)
          .single()
      ).data!;
    },
    dispose() {
      documentSql(
        `update app_private.reminder_settings set enabled=false;update public.messages set status='cancelled' where appointment_id='${appointment.id}' and status in('queued','processing','uncertain');`,
      );
    },
  };
}
function due(id: string) {
  documentSql(
    `update public.messages set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}';`,
  );
}
function expire(id: string) {
  documentSql(
    `update app_private.reminder_dispatches set lease_until=clock_timestamp()-interval '1 second' where message_id='${id}';`,
  );
}
async function cancellationLock(
  tenant: string,
  appointment: string,
  owner: string,
) {
  if (![tenant, appointment, owner].every((id) => /^[a-f0-9-]{36}$/.test(id)))
    throw new Error("Fixture IDs only");
  const sql = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_Nextapp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "",
    failed = false;
  sql.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  sql.stderr.on("data", () => {
    failed = true;
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    sql.once("error", reject);
    sql.once("close", resolve);
  });
  sql.stdin.write(
    `BEGIN; SELECT id FROM public.tenants WHERE id='${tenant}' FOR UPDATE;\n\\echo cancellation-locked\n`,
  );
  await expect.poll(() => output.includes("cancellation-locked")).toBe(true);
  return {
    async commit() {
      sql.stdin.end(
        `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',true); SELECT public.update_appointment('${appointment}',1,'{"status":"cancelled"}'); COMMIT;\n`,
      );
      expect(await closed).toBe(0);
      expect(failed).toBe(false);
    },
    close() {
      if (!sql.stdin.writableEnded) sql.stdin.end("ROLLBACK;\n");
    },
  };
}

test("two workers share a due outbox without duplicate provider submissions", async ({
  page,
}) => {
  const f = await scenario(page),
    gateway = await fixtureGateway();
  try {
    const provider = new FixtureProvider(gateway.url);
    const result = await Promise.all([
      runReminderBatch(f.store, provider),
      runReminderBatch(f.store, provider),
    ]);
    expect(result.reduce((n, r) => n + r.accepted, 0)).toBe(1);
    expect(gateway.sends).toBe(1);
    expect(gateway.ledger.size).toBe(1);
    const idle = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--use-env-proxy",
          "--import",
          "tsx",
          "scripts/reminder-worker.ts",
          "--local",
          "--simulate",
        ],
        { env: process.env, encoding: "utf8" },
      ),
    );
    expect(idle).toMatchObject({ mode: "enabled", claimed: 0, accepted: 0 });
    expect(await f.row()).toMatchObject({ status: "accepted", attempts: 1 });
    const health = await page.request.get("/api/reminders/health");
    expect(health.status()).toBe(200);
    expect(health.headers()["cache-control"]).toContain("no-store");
    expect(JSON.stringify(await health.json())).not.toContain(
      "@example.invalid",
    );
  } finally {
    f.dispose();
    await gateway.close();
  }
});
test("a cancelled appointment never reaches transport after its work was claimed", async ({
  page,
}) => {
  const f = await scenario(page),
    gateway = await fixtureGateway();
  try {
    const original = f.store.begin;
    f.store.begin = async (job) => {
      const lock = await cancellationLock(
        f.tenant,
        f.appointment.id,
        f.owner.id,
      );
      try {
        const waiting = original(job);
        await expect
          .poll(() =>
            Number(
              documentSql(
                "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%begin_reminder_dispatch%'",
              ),
            ),
          )
          .toBeGreaterThan(0);
        await lock.commit();
        return await waiting;
      } finally {
        lock.close();
      }
    };
    const result = await runReminderBatch(
      f.store,
      new FixtureProvider(gateway.url),
    );
    expect(result.cancelled).toBe(1);
    expect(gateway.sends).toBe(0);
    expect((await f.row()).status).toBe("cancelled");
  } finally {
    f.dispose();
    await gateway.close();
  }
});
test("provider acceptance followed by timeout is looked up without resending", async ({
  page,
}) => {
  const f = await scenario(page),
    gateway = await fixtureGateway("accept-and-hold");
  try {
    const provider = new FixtureProvider(gateway.url);
    const pending = runReminderBatch(f.store, provider, {
      timeoutMs: 2000,
      limit: 1,
    });
    await expect.poll(() => gateway.ledger.size).toBe(1);
    const cancelled = await page.request.patch(
      `/api/appointments/${f.appointment.id}`,
      { headers: origin, data: { version: 1, status: "cancelled" } },
    );
    expect(cancelled.status()).toBe(200);
    expect(await f.row()).toMatchObject({
      status: "processing",
      cancellation_requested_at: expect.any(String),
    });
    const first = await pending;
    expect(first.uncertain).toBe(1);
    expect((await f.row()).status).toBe("uncertain");
    expect(gateway.ledger.size).toBe(1);
    due(f.id);
    const second = await runReminderBatch(f.store, provider);
    expect(second.accepted).toBe(1);
    expect(gateway.sends).toBe(1);
    expect(gateway.lookups).toBe(1);
    expect(await f.row()).toMatchObject({ status: "accepted", attempts: 1 });
  } finally {
    f.dispose();
    await gateway.close();
  }
});
test("SIGKILL after provider acceptance recovers via persisted lease and lookup", async ({
  page,
}) => {
  const f = await scenario(page),
    gateway = await fixtureGateway("accept-and-hold");
  const child = spawn(
    process.execPath,
    [
      "--use-env-proxy",
      "--import",
      "tsx",
      "tests/fixtures/reminder-process.ts",
    ],
    {
      env: { ...process.env, TEST_REMINDER_GATEWAY: gateway.url },
      stdio: "ignore",
    },
  );
  const stopped = new Promise((resolve) => child.once("close", resolve));
  try {
    await expect.poll(() => gateway.ledger.size).toBe(1);
    child.kill("SIGKILL");
    await stopped;
    expect((await f.row()).status).toBe("processing");
    expire(f.id);
    const result = await runReminderBatch(
      f.store,
      new FixtureProvider(gateway.url),
    );
    expect(result.accepted).toBe(1);
    expect(gateway.sends).toBe(1);
    expect(gateway.lookups).toBe(1);
    expect((await f.row()).attempts).toBe(1);
  } finally {
    child.kill("SIGKILL");
    await stopped;
    f.dispose();
    await gateway.close();
  }
});
test("lost database acknowledgement never turns acceptance into a blind retry", async ({
  page,
}) => {
  const f = await scenario(page),
    gateway = await fixtureGateway();
  try {
    const provider = new FixtureProvider(gateway.url);
    const finish = f.store.finish;
    f.store.finish = async () => {
      throw new Error("Synthetic lost SQL response");
    };
    await expect(runReminderBatch(f.store, provider)).rejects.toThrow(
      "inspect persisted state",
    );
    expect(gateway.sends).toBe(1);
    expire(f.id);
    f.store.finish = finish;
    expect((await runReminderBatch(f.store, provider)).accepted).toBe(1);
    expect(gateway.sends).toBe(1);
    expect(gateway.lookups).toBe(1);
  } finally {
    f.dispose();
    await gateway.close();
  }
});
test("health degrades for an expired uncertain dispatch and stays scoped to the owner", async ({
  page,
  browser,
}) => {
  const f = await scenario(page);
  try {
    const run = crypto.randomUUID();
    await f.store.start(run, "test-v1");
    const job = (await f.store.claim(run)) as Claim;
    await f.store.begin(job);
    expire(f.id);
    const monitor = spawnSync(
      process.execPath,
      [
        "--use-env-proxy",
        "--import",
        "tsx",
        "scripts/reminder-health.ts",
        "--local",
        "--record",
      ],
      { env: process.env, encoding: "utf8" },
    );
    expect(monitor.status).toBe(2);
    expect(JSON.parse(monitor.stdout).status).toBe("degraded");
    const ownerHealth = await page.request.get("/api/reminders/health");
    expect((await ownerHealth.json()).counts.uncertain).toBe(1);
    const health = await intakeAdmin.rpc("reminder_worker_health", {
      p_persist: true,
    });
    expect(health.error).toBeNull();
    expect(health.data).toMatchObject({
      status: "degraded",
      warnings: expect.arrayContaining([
        expect.objectContaining({ kind: "uncertain" }),
      ]),
    });
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(other, await account());
    const report = await other.request.get("/api/reminders/health");
    expect(report.status()).toBe(200);
    expect((await report.json()).counts.uncertain).toBe(0);
    await otherContext.close();
    const anon = await browser.newContext();
    const request = await anon.request.get(
      "http://localhost:3100/api/reminders/health",
    );
    expect(request.status()).toBe(401);
    await anon.close();
  } finally {
    f.dispose();
  }
});
