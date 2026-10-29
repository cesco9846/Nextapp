/** Loopback-only synthetic benchmark. Never imports production credentials into fixtures. */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { localEnvironment } from "./local-env";
import { testRunnerSecret } from "../tests/fixtures/runner";
import type { BrowserContext } from "@playwright/test";

const label = process.argv[2];
if (!label || !/^[a-z0-9-]{1,40}$/.test(label))
  throw Error("Pass a local benchmark label");
Object.assign(process.env, localEnvironment());
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("../.cache/ms-playwright");
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
  )
)
  throw Error("Local benchmark only");
// Refuse to benchmark a server left over from another build/session.
await new Promise<void>((resolveReady, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(3100, () =>
    probe.close((error) => (error ? reject(error) : resolveReady())),
  );
});
const { chromium, expect } = await import("@playwright/test");
const { account, login, origin } = await import("../tests/e2e/helpers");
const server = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3100",
  ],
  {
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      GLOW_PROXY_SECRET: testRunnerSecret,
    },
    stdio: "ignore",
  },
);
const browser = await chromium.launch();
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null)
      throw Error("Benchmark server exited before readiness");
    try {
      ready = (await fetch("http://localhost:3100/api/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Benchmark application unavailable");
  const owner = await account();
  const { data: profile } = await owner.db
    .from("users")
    .select("tenant_id")
    .single();
  const { data: location } = await owner.db
    .from("locations")
    .select("id")
    .single();
  const { data: service } = await owner.db
    .from("services")
    .select("id")
    .single();
  const ids = [profile!.tenant_id, location!.id, service!.id, owner.id];
  if (!ids.every((x) => /^[a-f0-9-]{36}$/.test(x)))
    throw Error("Invalid local fixture identifiers");
  execFileSync(
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
      "-q",
    ],
    {
      input: `begin;
      insert into public.clients(tenant_id,first_name,last_name) select '${ids[0]}','Cliente sintetica','Benchmark '||n from generate_series(1,1000) n;
      with c as(select id,row_number() over(order by id) n from public.clients where tenant_id='${ids[0]}')
      insert into public.appointments(tenant_id,client_id,service_id,location_id,operator_id,service_name,price_cents,starts_at,ends_at)
      select '${ids[0]}',c.id,'${ids[2]}','${ids[1]}','${ids[3]}','Servizio sintetico benchmark',0,
      date_trunc('day',now())+(g.n-1)*interval '1 hour',date_trunc('day',now())+(g.n-1)*interval '1 hour'+interval '30 minutes'
      from generate_series(1,5000) g(n) join c on c.n=((g.n-1)%1000)+1;commit;`,
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  const contexts: BrowserContext[] = [];
  let uiReady = 0;
  for (let i = 0; i < 10; i++) {
    const context = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    const page = await context.newPage();
    await login(page, owner);
    if (i === 0) {
      const started = performance.now();
      await page.reload();
      await expect(
        page
          .getByRole("button", { name: /Cliente sintetica Benchmark/ })
          .first(),
      ).toBeVisible();
      uiReady = performance.now() - started;
    }
    contexts.push(context);
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86400000);
  const agenda = `/api/appointments?${new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })}`;
  const samples: Record<string, number[]> = {
    clients: [],
    agenda: [],
    create_client: [],
  };
  const timing: Record<string, Record<string, number[]>> = {};
  for (const [kind, path] of [
    ["clients", "/api/clients?page=1"],
    ["agenda", agenda],
    ["create_client", "/api/clients"],
  ]) {
    const run = async (i: number, measured: boolean) => {
      const request = contexts[i % contexts.length].request;
      const before = performance.now();
      const response =
        kind === "create_client"
          ? await request.post(path, {
              headers: origin,
              data: {
                first_name: "Cliente sintetica",
                last_name: `Scrittura benchmark ${i}`,
                email: "",
                phone: "",
              },
            })
          : await request.get(path);
      await response.body();
      if (response.status() !== (kind === "create_client" ? 201 : 200))
        throw Error(`Benchmark ${kind}: ${response.status()}`);
      if (measured) {
        samples[kind].push(performance.now() - before);
        for (const metric of (response.headers()["server-timing"] ?? "").split(
          ", ",
        )) {
          const m = /^(api|auth|profile);dur=([\d.]+)$/.exec(metric);
          if (m) ((timing[kind] ??= {})[m[1]] ??= []).push(Number(m[2]));
        }
      }
    };
    for (let i = 0; i < 10; i++) await run(i, false);
    await Promise.all(
      Array.from({ length: 10 }, async (_, worker) => {
        for (let i = worker; i < 100; i += 10) await run(i, true);
      }),
    );
  }
  const stats = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y);
    return {
      samples: a.length,
      p50_ms: a[Math.ceil(a.length * 0.5) - 1],
      p95_ms: a[Math.ceil(a.length * 0.95) - 1],
      max_ms: a.at(-1),
    };
  };
  const diff = execFileSync("git", ["diff", "--binary"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const report = {
    label,
    scope:
      "local loopback, one synthetic studio, 10 authenticated browser sessions; warm API, not a production SLA",
    measured_at: new Date().toISOString(),
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty_diff_sha256: createHash("sha256").update(diff).digest("hex"),
    build_id: (await readFile(".next-e2e/BUILD_ID", "utf8")).trim(),
    fixture: {
      clients_initial: 1000,
      appointments: 5000,
      concurrent_sessions: 10,
    },
    agenda_ui_reload_ready_ms: uiReady,
    api: Object.fromEntries(
      Object.entries(samples).map(([k, v]) => [k, stats(v)]),
    ),
    server_timing: Object.fromEntries(
      Object.entries(timing).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).map(([m, x]) => [m, stats(x)])),
      ]),
    ),
  };
  await mkdir(".cache/benchmarks", { recursive: true });
  await writeFile(
    `.cache/benchmarks/${label}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  for (const c of contexts) await c.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
