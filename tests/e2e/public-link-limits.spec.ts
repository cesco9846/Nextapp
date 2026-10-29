import { expect, test } from "@playwright/test";
import { packageFixture, issuePacket } from "./packages-helpers";
import { clinicalScenario } from "./clinical-helpers";
import { issueSignature, documentSql } from "./documents-helpers";
import { issueIntake, intakeAdmin } from "./intake-helpers";
import { origin } from "./helpers";
import { testRunnerSecret } from "../fixtures/runner";
import { publicLinkSource } from "@/lib/public-link-source";
import { createHash } from "node:crypto";

const source = (ip: string) => ({
  ...origin,
  "x-real-ip": ip,
  "x-glow-proxy-key": testRunnerSecret,
});
const digestSource = (ip: string) =>
  publicLinkSource(new Headers(source(ip)), {
    vercel: false,
    local: true,
    key: process.env.TEST_SUPABASE_SERVICE_KEY!,
    proxySecret: testRunnerSecret,
  });

test("invalid traffic is isolated across all public link families and two studios; forged forwarding cannot rotate ingress", async ({
  page,
  browser,
}) => {
  const a = await packageFixture(page);
  const native = await issuePacket(page, a);
  const context = await browser.newContext();
  const other = await context.newPage();
  const b = await clinicalScenario(other, true);
  const signed = await issueSignature(other, b.appointment.id);
  const intake = await issueIntake(other, b.appointment.id);
  const response = await other.request.post(
    `/api/appointments/${b.appointment.id}/response-links`,
    {
      headers: origin,
      data: { request_id: crypto.randomUUID(), appointment_version: 1 },
    },
  );
  expect(response.status()).toBe(201);
  const action = await response.json();
  const flows = [
    {
      path: "/api/packets/access",
      token: native.links[0].token,
      extra: { action: "read" },
    },
    { path: "/api/consent/read", token: signed.token, extra: {} },
    { path: "/api/intake/read", token: intake.token, extra: {} },
    { path: "/api/appointment-response/read", token: action.token, extra: {} },
  ];
  for (const [i, flow] of flows.entries()) {
    const r = await page.request.post(flow.path, {
      headers: source(`192.0.2.${i + 10}`),
      data: { token: flow.token, ...flow.extra },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
  const attacker = source("198.51.100.1");
  const statuses: number[] = [];
  for (let offset = 0; offset < 352; offset += 8) {
    const batch = await Promise.all(
      Array.from({ length: 8 }, async (_, n) => {
        const flow = flows[(offset + n) % flows.length];
        const r = await page.request.post(flow.path, {
          headers: {
            ...attacker,
            "x-forwarded-for": `203.0.113.${(n % 200) + 1}`,
          },
          data: {
            token: createHash("sha256")
              .update(`invalid-${offset + n}`)
              .digest("hex"),
            ...flow.extra,
          },
        });
        return r.status();
      }),
    );
    statuses.push(...batch);
  }
  expect(statuses.every((s) => s === 410 || s === 429)).toBe(true);
  expect(statuses).toContain(429);
  // Invalid-token quota does not consume a studio's quota, or deny a real link
  // on the same shared studio network below its overall ingress ceiling.
  for (const flow of flows) {
    const r = await page.request.post(flow.path, {
      headers: attacker,
      data: { token: flow.token, ...flow.extra },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
  const unavailable = await page.request.post("/api/packets/access", {
    headers: {
      ...source("203.0.113.200"),
      "x-glow-proxy-key": "visitor-controlled",
    },
    data: { token: native.links[0].token, action: "read" },
  });
  expect(unavailable.status()).toBe(503);
  const denied = await a.owner.db.rpc("use_public_link", {
    p_source_hash: "f".repeat(64),
    p_family: "packet",
    p_token_hash: "f".repeat(64),
    p_action: "read",
  });
  expect(denied.error?.code).toBe("42501");
  await context.close();
});

test("token quota cannot spend another token's or tenant's allowance; concurrent ingress cap is atomic", async ({
  page,
}) => {
  const f = await packageFixture(page);
  const one = await issuePacket(page, f);
  const hash = createHash("sha256").update(one.links[0].token).digest("hex");
  const quotaKey = createHash("sha256").update(`packet:${hash}`).digest("hex");
  documentSql(
    `insert into app_private.public_link_limits values ('token','${quotaKey}',date_trunc('minute',clock_timestamp()),30),('token','${quotaKey}',date_trunc('minute',clock_timestamp())+interval '1 minute',30)`,
  );
  const r = await page.request.post("/api/packets/access", {
    headers: source("192.0.2.100"),
    data: { token: one.links[0].token, action: "read" },
  });
  expect(r.status()).toBe(429);
  const two = await issuePacket(page, f);
  const read = await page.request.post("/api/packets/access", {
    headers: source("192.0.2.100"),
    data: { token: two.links[0].token, action: "read" },
  });
  expect(read.status()).toBe(200);
  const ip = "192.0.2.110";
  const sourceKey = digestSource(ip);
  documentSql(
    `insert into app_private.public_link_limits values('source','${sourceKey}',date_trunc('minute',clock_timestamp()),599),('source','${sourceKey}',date_trunc('minute',clock_timestamp())+interval '1 minute',599)`,
  );
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const r = await page.request.post("/api/packets/access", {
        headers: source(ip),
        data: {
          token: crypto.randomUUID().replaceAll("-", "").repeat(2),
          action: "read",
        },
      });
      return r.status();
    }),
  );
  expect(outcomes.filter((x) => x === 410)).toHaveLength(1);
  expect(outcomes.filter((x) => x === 429)).toHaveLength(7);
  // Even the service-only gateway still rechecks revocation and never exposes
  // raw quota tables to the ordinary application session.
  const foreign = await f.owner.db
    .from("users")
    .select("tenant_id")
    .eq("id", f.owner.id)
    .single();
  expect(foreign.error).toBeNull();
  const rpc = await intakeAdmin.rpc("use_public_link", {
    p_source_hash: digestSource("192.0.2.120"),
    p_family: "packet",
    p_token_hash: hash,
    p_action: "read",
  });
  expect((rpc.data as { status: number }).status).toBe(410);
});
