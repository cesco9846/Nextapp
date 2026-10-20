import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const args = process.argv.slice(2),
  project = "mexokvvvxdyekauupwvt";
const mode = args[2];
if (
  args[0] !== "--project-ref" ||
  args[1] !== project ||
  !["--configure", "--status", "--test"].includes(mode) ||
  (mode !== "--test" && args.length !== 3) ||
  (mode === "--test" && (args.length !== 5 || args[3] !== "--recipient"))
)
  throw new Error(
    "Use --project-ref mexokvvvxdyekauupwvt --configure|--status|--test --recipient <authorized-email>",
  );
const pat = process.env.Nextapp_token_access;
if (!pat) throw new Error("Management credential unavailable");
async function management(path: string, method = "GET", body?: object) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${project}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw new Error(`Auth management unavailable (${r.status})`);
  return (await r.json()) as Record<string, unknown>;
}
async function config() {
  return management("config/auth");
}
async function main() {
  if (mode === "--configure") {
    if (!process.env.RESEND_API_KEY)
      throw new Error("Resend binding unavailable");
    const templates = await Promise.all(
      ["confirmation", "recovery", "magic-link"].map((n) =>
        readFile(`supabase/templates/${n}.html`, "utf8"),
      ),
    );
    await management("config/auth", "PATCH", {
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: process.env.RESEND_API_KEY,
      smtp_admin_email: "reminder@glowlabs.it",
      smtp_sender_name: "Glow",
      rate_limit_email_sent: 20,
      smtp_max_frequency: 60,
      mailer_subjects_confirmation: "Conferma il tuo account Glow",
      mailer_templates_confirmation_content: templates[0],
      mailer_subjects_recovery: "Reimposta la password di Glow",
      mailer_templates_recovery_content: templates[1],
      mailer_subjects_magic_link: "Accedi a Glow",
      mailer_templates_magic_link_content: templates[2],
    });
    const c = await config();
    if (
      c.smtp_host !== "smtp.resend.com" ||
      String(c.smtp_port) !== "465" ||
      c.smtp_admin_email !== "reminder@glowlabs.it" ||
      c.smtp_sender_name !== "Glow" ||
      c.mailer_templates_confirmation_content !== templates[0] ||
      c.mailer_templates_recovery_content !== templates[1] ||
      c.mailer_templates_magic_link_content !== templates[2]
    )
      throw new Error("SMTP configuration did not match");
    console.log(
      JSON.stringify({
        configured: true,
        sender: "Glow <reminder@glowlabs.it>",
        hourlyLimit: 20,
        perRecipientSeconds: 60,
        emailsSent: false,
      }),
    );
  } else if (mode === "--test") {
    const email = z.email().parse(args[4]);
    const c = await config();
    if (
      c.smtp_host !== "smtp.resend.com" ||
      !c.smtp_pass ||
      c.site_url !== "https://glowlabs.it"
    )
      throw new Error("Configure canonical Auth SMTP before probing");
    // Read only: never create/confirm an official fixture account or change a password.
    const rows = (await management("database/query", "POST", {
      query: `select exists(select 1 from auth.users where lower(email)='${email.toLowerCase().replaceAll("'", "''")}' and email_confirmed_at is not null) as registered;`,
    })) as unknown as { registered: boolean }[];
    if (!rows[0]?.registered)
      throw new Error(
        "The authorized recipient needs an existing confirmed account; no account created",
      );
    const key =
      process.env.supabase_service_role_secret ?? process.env.supabase_secret;
    if (!key) throw new Error("Auth credential unavailable");
    const path = ".cache/logs/auth-smtp-probe.json";
    const fingerprint = createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex");
    let history: {
      recipient: string;
      requests: { kind: string; status: string; at: string }[];
    } = { recipient: fingerprint, requests: [] };
    try {
      history = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (history.recipient !== fingerprint)
      throw new Error(
        "Probe history belongs to another recipient; inspect it before another send",
      );
    await mkdir(".cache/logs", { recursive: true });
    for (const kind of ["otp", "recover"]) {
      const previous = history.requests.filter((r) => r.kind === kind);
      if (previous.some((r) => r.status === "accepted")) continue;
      const last = previous.at(-1);
      if (
        last &&
        (last.status !== "http_429" || Date.now() - Date.parse(last.at) < 65000)
      )
        throw new Error(
          "Previous probe is ambiguous or still cooling down; no resend",
        );
      const record = {
        kind,
        status: "attempted",
        at: new Date().toISOString(),
      };
      history.requests.push(record);
      await writeFile(path, JSON.stringify(history));
      // The verifier is not stored and the returned email links are never followed.
      const challenge = createHash("sha256")
        .update(randomBytes(32).toString("base64url"))
        .digest("base64url");
      const redirect =
        "https://glowlabs.it/auth/conferma" +
        (kind === "recover" ? "?next=/nuova-password" : "");
      const r = await fetch(
        `https://${project}.supabase.co/auth/v1/${kind}?redirect_to=${encodeURIComponent(redirect)}`,
        {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            ...(kind === "otp" ? { create_user: false } : {}),
            code_challenge: challenge,
            code_challenge_method: "s256",
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      record.status = r.ok ? "accepted" : `http_${r.status}`;
      await writeFile(path, JSON.stringify(history));
      console.log(
        JSON.stringify({
          kind,
          status: r.status,
          passwordChanged: false,
          linkConsumed: false,
          accountCreated: false,
        }),
      );
      if (!r.ok)
        throw new Error(
          `Auth probe not accepted (${r.status}); no automatic retry`,
        );
    }
  } else {
    const c = await config();
    console.log(
      JSON.stringify({
        configured: Boolean(c.smtp_host && c.smtp_pass),
        host: c.smtp_host,
        port: c.smtp_port,
        sender: c.smtp_admin_email,
        name: c.smtp_sender_name,
        hourlyLimit: c.rate_limit_email_sent,
        siteUrl: c.site_url,
      }),
    );
  }
}
try {
  await main();
} catch (e) {
  console.error(
    e instanceof Error ? e.message : "Auth SMTP operation unavailable",
  );
  process.exitCode = 1;
}
