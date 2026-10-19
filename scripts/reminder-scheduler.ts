import { randomBytes, randomUUID, createHmac } from "node:crypto";

// Explicit official target only; never echo response bodies, headers or credentials.
class SchedulerError extends Error {}
const project = "mexokvvvxdyekauupwvt";
const args = process.argv.slice(2);
const modes = [
  "--configure",
  "--schedule",
  "--pause",
  "--probe",
  "--status",
  "--schedule-retention",
  "--run-retention",
  "--pause-retention",
];
if (
  args.length !== 3 ||
  args[0] !== "--project-ref" ||
  args[1] !== project ||
  !modes.includes(args[2])
)
  throw new SchedulerError(
    "Use --project-ref mexokvvvxdyekauupwvt --configure|--schedule|--pause|--probe|--status|--schedule-retention|--run-retention|--pause-retention",
  );
const mode = args[2];
const pat = process.env.Nextapp_token_access;
if (!pat) throw new SchedulerError("Management credential unavailable");

async function sql(query: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(
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
  if (!response.ok)
    throw new SchedulerError(
      `Database management unavailable (${response.status})`,
    );
  return await response.json();
}
async function runnerSecret() {
  const rows = await sql(
    "select decrypted_secret as value from vault.decrypted_secrets where name='glow_reminder_runner';",
  );
  const value = rows[0]?.value;
  if (
    value !== undefined &&
    (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
  )
    throw new SchedulerError("Unexpected runner credential format");
  return value as string | undefined;
}
async function probe() {
  const value = await runnerSecret();
  if (!value) throw new SchedulerError("Configure credentials before probing");
  for (const kind of ["run", "monitor"]) {
    const stamp = Math.floor(Date.now() / 1000).toString(),
      nonce = randomUUID();
    const signature = createHmac("sha256", value)
      .update(`${kind}\n${stamp}\n${nonce}`)
      .digest("hex");
    const r = await fetch(
      `https://glowlabs.it/api/internal/reminders/${kind}`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "X-Glow-Time": stamp,
          "X-Glow-Nonce": nonce,
          "X-Glow-Signature": signature,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok)
      throw new SchedulerError(`Runner ${kind} unavailable (${r.status})`);
    const result = await r.json();
    if (
      result.mode !== "disabled" ||
      (kind === "run" && (result.claimed !== 0 || result.accepted !== 0))
    )
      throw new SchedulerError(
        "Probe requires disabled delivery and zero claims",
      );
  }
}
async function main() {
  const config = await sql(
    "select enabled from app_private.reminder_settings;",
  );
  if (
    ["--configure", "--schedule", "--probe"].includes(mode) &&
    config[0]?.enabled !== false
  )
    throw new SchedulerError(
      "Pause delivery before configuring/probing; no dispatch attempted",
    );
  if (mode === "--configure") {
    if (!process.env.VERCEL_TOKEN || !process.env.RESEND_API_KEY)
      throw new SchedulerError("Vercel and Resend bindings required");
    let secret = await runnerSecret();
    if (!secret) {
      secret = randomBytes(32).toString("hex");
      await sql(
        `select vault.create_secret('${secret}','glow_reminder_runner','Glow cron to Vercel, server only');`,
      );
    }
    for (const [key, value] of [
      ["REMINDER_RUNNER_SECRET", secret],
      ["RESEND_API_KEY", process.env.RESEND_API_KEY],
    ]) {
      const r = await fetch(
        "https://api.vercel.com/v10/projects/prj_v5J1Oc43amxd1MKJU8MQdkYoIfkf/env?teamId=team_yUX5Fj5mWKEDZNZI99Sgzb3X&upsert=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key,
            value,
            type: "sensitive",
            target: ["production"],
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok)
        throw new SchedulerError(
          `Vercel configuration unavailable (${r.status})`,
        );
    }
    console.log(
      JSON.stringify({
        configured: true,
        deploymentRequired: true,
        delivery: "disabled",
        jobsActivated: false,
      }),
    );
  } else if (mode === "--schedule") {
    await probe();
    await sql(
      "select cron.schedule('glow-reminder-worker','* * * * *',$job$select app_private.enqueue_reminder_runner('run');$job$); select cron.schedule('glow-reminder-monitor','* * * * *',$job$select app_private.enqueue_reminder_runner('monitor');$job$);",
    );
    console.log(
      JSON.stringify({
        scheduled: ["glow-reminder-worker", "glow-reminder-monitor"],
        cadence: "every minute",
        delivery: "disabled",
        emailAlerts: false,
      }),
    );
  } else if (mode === "--pause") {
    await sql(
      "select cron.unschedule(jobid) from cron.job where jobname in('glow-reminder-worker','glow-reminder-monitor');",
    );
    console.log(
      JSON.stringify({ scheduled: false, inFlightRequestsNotRecalled: true }),
    );
  } else if (mode === "--probe") {
    await probe();
    console.log(
      JSON.stringify({
        worker: "disabled",
        monitor: "ok",
        claimed: 0,
        emailSent: false,
      }),
    );
  } else if (mode === "--schedule-retention") {
    await sql(
      "select cron.schedule('glow-reminder-retention','17 * * * *',$job$select app_private.prune_reminder_logs();$job$);",
    );
    console.log(
      JSON.stringify({
        retentionScheduled: true,
        cadence: "hourly",
        deliveryEnabled: config[0]?.enabled,
      }),
    );
  } else if (mode === "--run-retention") {
    console.log(
      JSON.stringify(
        await sql("select app_private.prune_reminder_logs() as retention;"),
      ),
    );
  } else if (mode === "--pause-retention") {
    await sql(
      "select cron.unschedule(jobid) from cron.job where jobname='glow-reminder-retention';",
    );
    console.log(
      JSON.stringify({
        retentionScheduled: false,
        deliveryEnabled: config[0]?.enabled,
      }),
    );
  } else {
    const jobs = await sql(
      "select jobname,schedule,active from cron.job where jobname in('glow-reminder-worker','glow-reminder-monitor','glow-reminder-retention') order by jobname;",
    );
    const requests = await sql(
      "select distinct on(i.kind) i.kind,i.queued_at,i.finished_at,coalesce(i.status_code,r.status_code) as status_code from app_private.reminder_invocations i left join net._http_response r on r.id=i.id order by i.kind,i.queued_at desc;",
    );
    const runs = await sql(
      "select distinct on(j.jobname) j.jobname,d.status,d.start_time,d.end_time from cron.job_run_details d join cron.job j using(jobid) where j.jobname in('glow-reminder-worker','glow-reminder-monitor','glow-reminder-retention') order by j.jobname,d.start_time desc;",
    );
    const storage = await sql(
      "select pg_database_size(current_database()) as database_bytes, (select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and ((n.nspname='app_private' and c.relname in('reminder_runs','reminder_invocations','reminder_nonces','reminder_alerts')) or (n.nspname='cron' and c.relname='job_run_details') or (n.nspname='net' and c.relname in('_http_response','http_request_queue')))) as operational_log_bytes;",
    );
    console.log(
      JSON.stringify({
        deliveryEnabled: config[0]?.enabled,
        jobs,
        requests,
        runs,
        storage,
        emailAlerts: false,
      }),
    );
  }
}
try {
  await main();
} catch (error) {
  console.error(
    error instanceof SchedulerError
      ? error.message
      : "Scheduler operation unavailable",
  );
  process.exitCode = 1;
}
