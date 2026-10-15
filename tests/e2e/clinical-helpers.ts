import { mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, type Page } from "@playwright/test";
import { account, login, origin } from "./helpers";
import type { Pigment, PigmentLot, TemplateVersion } from "@/lib/clinical";
process.env.XDG_CACHE_HOME ??= resolve("../.cache");
mkdirSync(resolve(process.env.XDG_CACHE_HOME, "fontconfig"), {
  recursive: true,
});

// Deterministic local contention: keep the same tenant lock used by the real
// assignment RPC, then revoke only after the HTTP request is demonstrably waiting.
export async function holdClinicalTenant(tenant: string) {
  const uuid = /^[0-9a-f-]{36}$/;
  if (!uuid.test(tenant)) throw new Error("Expected a local fixture UUID");
  const psql = spawn(
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
  let output = "";
  let failure = false;
  psql.stderr.on("data", () => {
    failure = true;
  });
  psql.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    psql.on("error", reject);
    psql.on("close", resolve);
  });
  psql.stdin.write(
    `BEGIN; SELECT id FROM public.tenants WHERE id='${tenant}' FOR UPDATE;\n\\echo tenant-locked\n`,
  );
  await expect.poll(() => output.includes("tenant-locked")).toBe(true);
  return {
    async revoke(
      owner: string,
      client: string,
      operator: string,
      version: number,
    ) {
      if (
        ![owner, client, operator].every((id) => uuid.test(id)) ||
        !Number.isSafeInteger(version)
      )
        throw new Error("Expected local fixture identifiers");
      psql.stdin.end(
        `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',true); SELECT public.set_client_assignment('${client}','${operator}',false,${version}); COMMIT;\n`,
      );
      expect(await exited).toBe(0);
      expect(failure).toBe(false);
    },
    close() {
      if (!psql.stdin.writableEnded) psql.stdin.end("ROLLBACK;\n");
    },
  };
}
export function waitingClinicalRequests() {
  return Number(
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_Nextapp",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        "select count(*) from pg_stat_activity where wait_event_type='Lock' and query ilike '%treatment_preparation%'",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
}
export async function labelImage() {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#fff"/><rect x="24" y="24" width="672" height="432" rx="8" fill="none" stroke="#263e36" stroke-width="2"/><g font-family="sans-serif" fill="#263e36"><text x="56" y="96" font-size="30">ETICHETTA DI PROVA</text><text x="56" y="154" font-size="23">Linea dimostrativa — Terra 04</text><text x="56" y="226" font-size="23">LOT DEMO-01</text><text x="56" y="278" font-size="23">Scadenza: 31/12/2035</text><text x="56" y="380" font-size="19">Dati sintetici. Non usare per trattamenti.</text></g></svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
}
export async function appointment(
  page: Page,
  owner: Awaited<ReturnType<typeof account>>,
) {
  const client = await page.request.post("/api/clients", {
    headers: origin,
    data: { first_name: "Elena", last_name: "Di prova", phone: "", email: "" },
  });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).id as string;
  const services = await owner.db.from("services").select("id").single();
  const locations = await owner.db.from("locations").select("id").single();
  const start = new Date(Date.now() + 2 * 86400000);
  start.setUTCHours(9, 0, 0, 0);
  const result = await page.request.post("/api/appointments", {
    headers: { ...origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      client_id: clientId,
      service_id: services.data!.id,
      location_id: locations.data!.id,
      operator_id: owner.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3600000).toISOString(),
      price_cents: 5000,
    },
  });
  expect(result.status()).toBe(201);
  return (await result.json()) as {
    id: string;
    version: number;
    client_id: string;
  };
}
export async function model(
  page: Page,
  kind: "consent" | "anamnesis",
  title: string,
) {
  const question = crypto.randomUUID();
  const body = {
    request_id: crypto.randomUUID(),
    template_id: null,
    version: 0,
    kind,
    title,
    body: "Testo dimostrativo per i test. Non è un documento valido per trattamenti.",
    questions:
      kind === "anamnesis"
        ? [
            {
              id: question,
              label: "Annotazione dimostrativa",
              type: "text",
              required: true,
            },
          ]
        : [],
    service_id: null,
  };
  const result = await page.request.post("/api/clinical/templates", {
    headers: origin,
    data: body,
  });
  expect(result.status()).toBe(201);
  return { revision: (await result.json()) as TemplateVersion, body, question };
}
export async function clinicalScenario(page: Page, withPreparation = false) {
  const owner = await account();
  await login(page, owner);
  const consent = await model(page, "consent", "Consenso dimostrativo");
  const anam = await model(page, "anamnesis", "Questionario dimostrativo");
  const pigmentResult = await page.request.post("/api/clinical/pigments", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      brand: "Linea di prova",
      name: "Terra 04",
      code: "DEMO",
      active: true,
    },
  });
  expect(pigmentResult.status()).toBe(201);
  const pigment = (await pigmentResult.json()) as Pigment;
  const content = await labelImage();
  const labelResult = await page.request.post(
    `/api/clinical/pigments/${pigment.id}/labels`,
    {
      headers: origin,
      data: {
        request_id: crypto.randomUUID(),
        size_bytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
        mime_type: "image/jpeg",
      },
    },
  );
  expect(labelResult.status()).toBe(201);
  const label = (await labelResult.json()) as {
    id: string;
    upload_path: string;
  };
  expect(
    (
      await owner.db.storage
        .from("glow-private")
        .upload(label.upload_path, content, {
          contentType: "image/jpeg",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  expect(
    (
      await page.request.post(`/api/files/${label.id}/complete`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(200);
  const lotResult = await page.request.post("/api/clinical/lots", {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      id: null,
      version: 0,
      pigment_id: pigment.id,
      lot_number: "DEMO-01",
      expires_on: "2035-12-31",
      label_file_id: label.id,
      label_text: "Etichetta sintetica",
      active: true,
    },
  });
  expect(lotResult.status()).toBe(201);
  const lot = (await lotResult.json()) as PigmentLot;
  const a = await appointment(page, owner);
  const preparationBody = {
    request_id: crypto.randomUUID(),
    appointment_version: a.version,
    version: 0,
    consent_version_id: consent.revision.id,
    anamnesis_version_id: anam.revision.id,
    answers: { [anam.question]: "Nota sintetica riservata" },
    lot_ids: [lot.id],
  };
  if (withPreparation)
    expect(
      (
        await page.request.post(`/api/appointments/${a.id}/preparation`, {
          headers: origin,
          data: preparationBody,
        })
      ).status(),
    ).toBe(200);
  return {
    owner,
    consent,
    anam,
    pigment,
    lot,
    label,
    appointment: a,
    preparationBody,
  };
}
