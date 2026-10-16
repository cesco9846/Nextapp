import { expect, test, type Page } from "@playwright/test";
import { Webhook } from "svix";
import { account, login, origin } from "./helpers";
import { documentSql } from "./documents-helpers";
import { intakeAdmin } from "./intake-helpers";
import { reminderStore } from "@/reminders/store";
import { runReminderBatch } from "@/reminders/worker";
import { ResendReminderProvider } from "@/reminders/resend-provider";
import { testResendSecret } from "../fixtures/resend";
function signed(payload: object, id = `msg_${crypto.randomUUID()}`) {
  const body = JSON.stringify(payload),
    now = new Date();
  return {
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(now.getTime() / 1000).toString(),
      "svix-signature": new Webhook(testResendSecret).sign(id, now, body),
      "Content-Type": "application/json",
    },
    data: body,
  };
}
async function scenario(page: Page) {
  const owner = await account();
  await login(page, owner);
  const enabled = await page.request.put("/api/reminders/settings", {
    headers: origin,
    data: { enabled: true },
  });
  expect(enabled.status()).toBe(200);
  documentSql(
    "update app_private.reminder_settings set enabled=true,provider='resend-v1';",
  );
  const createdClient = await page.request.post("/api/clients", {
    headers: origin,
    data: {
      first_name: "Cliente",
      last_name: "Sintetica",
      email: "resend-fixture@example.invalid",
      phone: "",
    },
  });
  expect(createdClient.status()).toBe(201);
  const client = (await createdClient.json()) as { id: string };
  const services = (await owner.db.from("services").select("id").single())
    .data!;
  const location = (await owner.db.from("locations").select("id").single())
    .data!;
  const starts = new Date(Date.now() + 25 * 3600000);
  const appointment = await owner.db.rpc("create_appointment", {
    p_key: crypto.randomUUID(),
    p_data: {
      client_id: client.id,
      service_id: services.id,
      location_id: location.id,
      operator_id: owner.id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(appointment.error).toBeNull();
  if (!appointment.data) throw new Error("Synthetic appointment unavailable");
  documentSql(
    `update public.messages set scheduled_for=clock_timestamp()-interval '1 minute' where appointment_id='${appointment.data.id}';`,
  );
  const message = (
    await owner.db
      .from("messages")
      .select("id")
      .eq("appointment_id", appointment.data.id)
      .single()
  ).data!;
  const providerId = crypto.randomUUID();
  const event = (type: string, target = "resend-fixture@example.invalid") => ({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: providerId,
      from: "Glow <reminder@glowlabs.it>",
      to: [target],
      tags: { glow_message_id: message.id },
      bounce: { type: "Permanent" },
    },
  });
  return {
    owner,
    id: message.id,
    providerId,
    event,
    async row() {
      return (
        await owner.db
          .from("messages")
          .select("status,provider_id,attempts,failure_code")
          .eq("id", message.id)
          .single()
      ).data!;
    },
    dispose() {
      documentSql("update app_private.reminder_settings set enabled=false;");
    },
  };
}
test("owner email settings are scoped, require same origin and never expose dispatch control", async ({
  page,
}) => {
  expect((await page.request.get("/api/reminders/settings")).status()).toBe(
    401,
  );
  const owner = await account(),
    other = await account();
  await login(page, owner);
  const initial = await page.request.get("/api/reminders/settings");
  expect(await initial.json()).toMatchObject({
    enabled: false,
    from: "Glow <reminder@glowlabs.it>",
    reply_to: owner.email,
    reply_to_verified: true,
    hours_before: 24,
  });
  expect(
    (
      await page.request.put("/api/reminders/settings", {
        headers: { Origin: "https://untrusted.example" },
        data: { enabled: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.put("/api/reminders/settings", {
        headers: origin,
        data: { enabled: true, delivery_enabled: true },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.put("/api/reminders/settings", {
        headers: origin,
        data: { enabled: true },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await other.db.from("tenants").select("reminders_enabled").single()).data!
      .reminders_enabled,
  ).toBe(false);
});
test("signed early delivery resolves an ambiguous send, duplicates and late events cannot regress it", async ({
  page,
}) => {
  const f = await scenario(page);
  try {
    let calls = 0;
    const adapter = new ResendReminderProvider(
      "synthetic",
      async (id) => {
        const result = await intakeAdmin.rpc("lookup_reminder_acceptance", {
          p_id: id,
        });
        return result.data as { kind: "accepted"; providerId: string };
      },
      async () => {
        calls++;
        expect(
          (
            await page.request.post(
              "/api/webhooks/resend",
              signed(f.event("email.delivered")),
            )
          ).status(),
        ).toBe(204);
        return new Response("ambiguous-upstream", { status: 500 });
      },
    );
    await runReminderBatch(reminderStore(intakeAdmin), adapter);
    expect(calls).toBe(1);
    expect(await f.row()).toMatchObject({
      status: "delivered",
      provider_id: f.providerId,
      attempts: 1,
    });
    const sent = signed(f.event("email.sent"));
    expect(
      (await page.request.post("/api/webhooks/resend", sent)).status(),
    ).toBe(204);
    expect(
      (await page.request.post("/api/webhooks/resend", sent)).status(),
    ).toBe(204);
    expect((await f.row()).status).toBe("delivered");
  } finally {
    f.dispose();
  }
});
test("unsigned, modified, oversized and mismatched recipient events cannot change delivery", async ({
  page,
}) => {
  const f = await scenario(page);
  try {
    const adapter = new ResendReminderProvider(
      "synthetic",
      async () => ({ kind: "unknown" }),
      async () => Response.json({ id: f.providerId }),
    );
    await runReminderBatch(reminderStore(intakeAdmin), adapter);
    expect((await f.row()).status).toBe("accepted");
    expect(
      (
        await page.request.post("/api/webhooks/resend", {
          data: f.event("email.bounced"),
        })
      ).status(),
    ).toBe(400);
    const invalid = signed(f.event("email.bounced"));
    expect(
      (
        await page.request.post("/api/webhooks/resend", {
          ...invalid,
          data: invalid.data + " ",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/webhooks/resend", {
          data: "x".repeat(65537),
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post(
          "/api/webhooks/resend",
          signed(f.event("email.bounced", "wrong@example.invalid")),
        )
      ).status(),
    ).toBe(204);
    expect((await f.row()).status).toBe("accepted");
    expect(
      (
        await page.request.post(
          "/api/webhooks/resend",
          signed(f.event("email.bounced")),
        )
      ).status(),
    ).toBe(204);
    expect(await f.row()).toMatchObject({
      status: "bounced",
      failure_code: "provider_bounced",
    });
    const health = await page.request.get("/api/reminders/health");
    expect((await health.json()).counts.failed).toBe(1);
  } finally {
    f.dispose();
  }
});
