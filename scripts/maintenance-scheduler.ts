import { createHmac, randomUUID } from "node:crypto";

const project = "mexokvvvxdyekauupwvt";
const args = process.argv.slice(2),
  mode = args[2];
if (
  args.length !== 3 ||
  args[0] !== "--project-ref" ||
  args[1] !== project ||
  !["--status", "--probe", "--schedule", "--pause"].includes(mode)
)
  throw new Error(
    "Use --project-ref mexokvvvxdyekauupwvt --status|--probe|--schedule|--pause",
  );
const pat = process.env.Nextapp_token_access;
if (!pat) throw new Error("Management credential unavailable");
async function sql(query: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${project}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok)
    throw new Error(`Maintenance management unavailable (${r.status})`);
  return r.json();
}
async function probe() {
  const config = await sql(
    "select enabled from app_private.maintenance_settings;",
  );
  if (config[0]?.enabled !== false)
    throw new Error("Probe requires maintenance OFF; reminders are unaffected");
  const rows = await sql(
    "select decrypted_secret as value from vault.decrypted_secrets where name='glow_reminder_runner';",
  );
  const secret = rows[0]?.value;
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/.test(secret))
    throw new Error("Runner binding unavailable");
  for (const kind of ["documents", "cleanup"]) {
    const stamp = Math.floor(Date.now() / 1000).toString(),
      nonce = randomUUID();
    const r = await fetch(
      `https://glowlabs.it/api/internal/maintenance/${kind}`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "X-Glow-Time": stamp,
          "X-Glow-Nonce": nonce,
          "X-Glow-Signature": createHmac("sha256", secret)
            .update(`${kind}\n${stamp}\n${nonce}`)
            .digest("hex"),
        },
        body: "{}",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw new Error(`Maintenance ${kind} unavailable (${r.status})`);
    const result = await r.json();
    if (
      result.mode !== "disabled" ||
      result.processed !== 0 ||
      result.failed !== 0
    )
      throw new Error("Disabled probe did not match");
  }
}
async function main() {
  if (mode === "--probe") {
    await probe();
    console.log(
      JSON.stringify({
        probed: true,
        maintenance: "disabled",
        remindersChanged: false,
      }),
    );
  } else if (mode === "--schedule") {
    await probe();
    await sql(`begin;
      update app_private.maintenance_settings set enabled=true;
      select cron.schedule('glow-document-worker','* * * * *',$job$select app_private.enqueue_maintenance_runner('documents');$job$);
      select cron.schedule('glow-file-cleanup','*/10 * * * *',$job$select app_private.enqueue_maintenance_runner('cleanup');$job$);
      select cron.schedule('glow-maintenance-monitor','*/5 * * * *',$job$select public.maintenance_worker_health(true);$job$);
      commit;`);
    await sql(
      "select app_private.enqueue_maintenance_runner('documents'); select app_private.enqueue_maintenance_runner('cleanup');",
    );
    console.log(
      JSON.stringify({
        scheduled: true,
        documents: "every minute",
        cleanup: "every 10 minutes",
        monitor: "every 5 minutes",
        emailAlerts: false,
        remindersChanged: false,
      }),
    );
  } else if (mode === "--pause") {
    await sql(
      "begin; update app_private.maintenance_settings set enabled=false; select cron.unschedule(jobid) from cron.job where jobname in('glow-document-worker','glow-file-cleanup','glow-maintenance-monitor'); commit;",
    );
    console.log(
      JSON.stringify({
        maintenance: "disabled",
        inFlightNotRecalled: true,
        remindersChanged: false,
      }),
    );
  } else {
    const health = await sql(
      "select public.maintenance_worker_health(false) as health;",
    );
    const jobs = await sql(
      "select jobname,schedule,active from cron.job where jobname in('glow-document-worker','glow-file-cleanup','glow-maintenance-monitor') order by jobname;",
    );
    const requests = await sql(
      "select distinct on(i.kind) i.kind,i.queued_at,i.finished_at,coalesce(i.status_code,r.status_code) as status_code from app_private.maintenance_invocations i left join net._http_response r on r.id=i.id order by i.kind,i.queued_at desc;",
    );
    console.log(
      JSON.stringify({
        health: health[0]?.health,
        jobs,
        requests,
        emailAlerts: false,
      }),
    );
  }
}
try {
  await main();
} catch {
  // Remote error bodies can include private SQL/headers. Never echo them.
  console.error(
    "Maintenance operation unavailable; inspect configuration/status before retrying",
  );
  process.exitCode = 1;
}
