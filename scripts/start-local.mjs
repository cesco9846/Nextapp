import { spawn, spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";

// Kong serves these non-secret templates as an unprivileged user. Cloud
// checkouts can default to 0600; only these public email assets need 0644.
for (const name of ["confirmation", "recovery", "magic-link"])
  chmodSync(`supabase/templates/${name}.html`, 0o644);

// The CLI's status output contains local credentials. Keep it out of logs.
// BusyBox health probes need a loopback-only proxy correction in this cloud.
const child = spawn(
  process.execPath,
  [
    "scripts/supabase.mjs",
    "start",
    "--exclude",
    "studio,realtime,edge-runtime,imgproxy,logflare,vector,supavisor,postgres-meta",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let diagnostic = "";
child.stderr.on("data", (chunk) => {
  diagnostic = (diagnostic + chunk).slice(-16000);
});
function fixHealth() {
  spawnSync("python3", ["scripts/fix-local-health.py"], {
    stdio: "ignore",
    timeout: 15000,
  });
}
const timer = setInterval(fixHealth, 2500);
child.on("error", () => {
  clearInterval(timer);
  console.error("Cannot start the local Supabase CLI.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  clearInterval(timer);
  if (code !== 0) {
    const safe = diagnostic.replace(
      /eyJ[A-Za-z0-9_.-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
      "[redacted]",
    );
    console.error(safe);
    process.exitCode = code ?? 1;
    return;
  }
  const authProxy = spawnSync("python3", ["scripts/fix-local-auth-proxy.py"], {
    stdio: ["ignore", "inherit", "ignore"],
    timeout: 45000,
  });
  if (authProxy.status !== 0) {
    console.error("Cannot configure local Auth template access.");
    process.exitCode = 1;
    return;
  }
  fixHealth();
  console.log(
    "Local Supabase is ready. Run npm run db:migrate:local, then npm run test:db or npm run test:e2e.",
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
