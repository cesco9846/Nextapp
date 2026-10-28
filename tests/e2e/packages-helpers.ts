import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { account, login, origin } from "./helpers";
import { appointment } from "./clinical-helpers";
import {
  defaultPackages,
  type PackageContent,
  type PacketContext,
} from "@/lib/packages";
export const writing = [
  [
    [0.1, 0.2],
    [0.2, 0.4],
    [0.3, 0.2],
    [0.4, 0.5],
    [0.5, 0.3],
    [0.6, 0.6],
    [0.8, 0.4],
  ],
] as [number, number][][];
export async function packageFixture(
  page: Page,
  minor = false,
  two = false,
  key = "microblading",
) {
  const owner = await account();
  await login(page, owner);
  const apptCreated = await appointment(page, owner);
  const service = (await owner.db.from("services").select("id").single()).data!;
  const appt = { ...apptCreated, service_id: service.id };
  const content: PackageContent = {
    ...structuredClone(defaultPackages.find((p) => p.key === key)!),
    reviewed: true,
    privacy_notice:
      "Informativa sintetica esclusivamente di prova: dati e consensi per questa seduta sintetica, nessun uso clinico reale. Conservazione e basi approvate soltanto come fixture di test.",
    jurisdiction: "Ambito sintetico locale di test",
    minors_enabled: minor,
    minimum_age: minor ? 16 : null,
    representatives_required: minor ? (two ? 2 : 1) : null,
    minors_basis: minor
      ? "Requisito sintetico di test, non è una regola da usare su persone reali."
      : "",
  };
  let r = await page.request.post("/api/clinical/packages/profile", {
    headers: origin,
    data: {
      version: 0,
      details: {
        legal_name: "Studio Sintetico SRL",
        tax_id: "TEST-000000",
        data_controller: "Titolare sintetico",
        address: "Via di prova 1",
        email: "studio@example.invalid",
        phone: "0000000000",
        pec: "",
      },
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  r = await page.request.post("/api/clinical/packages", {
    headers: origin,
    data: { id: null, version: 0, service_id: appt.service_id, content },
  });
  expect(r.status(), await r.text()).toBe(201);
  const saved = await r.json();
  r = await page.request.post("/api/clinical/packages/publish", {
    headers: origin,
    data: { id: saved.id, version: saved.version },
  });
  expect(r.status(), await r.text()).toBe(200);
  const published = await r.json();
  const details = {
    date_of_birth: minor ? "2010-01-01" : "1990-01-01",
    birthplace: "Luogo sintetico",
    session_kind: "first",
    identity_verified: true,
    verification_method: "Verifica in presenza solo fixture sintetica",
    representatives: minor
      ? Array.from({ length: two ? 2 : 1 }, (_, i) => ({
          name: `Genitore sintetico ${i + 1}`,
          role: "parent",
          contact: `genitore${i + 1}@example.invalid`,
          verification_method:
            "Identità e responsabilità verificate soltanto nella fixture",
          verified: true,
        }))
      : [],
  };
  return { owner, appt, content, saved, published, details };
}
export async function issuePacket(
  page: Page,
  f: Awaited<ReturnType<typeof packageFixture>>,
  overrides: Record<string, unknown> = {},
) {
  const r = await page.request.post(`/api/appointments/${f.appt.id}/packets`, {
    headers: origin,
    data: {
      request_id: crypto.randomUUID(),
      appointment_version: f.appt.version,
      package_version_id: f.published.published_version_id,
      details: f.details,
      lot_ids: [],
      mode: "link",
      ...overrides,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()) as {
    id: string;
    links: { token: string; name: string }[];
  };
}
export async function packetCall(
  request: APIRequestContext,
  token: string,
  action: string,
  input?: unknown,
) {
  const r = await request.post("/api/packets/access", {
    headers: origin,
    data: { token, action, input },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as PacketContext;
}
export function answersFor(content: PackageContent) {
  return Object.fromEntries(
    content.questions.map((q) => [q.id, q.type === "text" ? "" : false]),
  );
}
export function signPacket(c: PacketContext, scope = "none") {
  return {
    request_id: crypto.randomUUID(),
    snapshot_hash: c.snapshot_hash,
    confirmed: true,
    aftercare_received: true,
    authority_confirmed: true,
    signature: writing,
    photo_documentation: scope !== "none",
    photo_demonstration: scope !== "none",
    photo_scope: scope,
  };
}
