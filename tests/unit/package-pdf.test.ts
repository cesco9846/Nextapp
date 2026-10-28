import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { renderConsentPdf } from "@/documents/pdf-renderer";
import { defaultPackages } from "@/lib/packages";
import type { SignedPayload } from "@/lib/consents";
describe("native signed PMU PDF", () => {
  it("preserves both representatives, explicit choices, source sections and counter-signature deterministically", async () => {
    const content = {
      ...structuredClone(defaultPackages[1]),
      privacy_notice:
        "Informativa sintetica di test per i dati della seduta. Nessuna persona reale.",
      reviewed: true,
      jurisdiction: "Ambito sintetico",
      minors_enabled: true,
      minimum_age: 16,
      representatives_required: 2,
      minors_basis:
        "Requisito sintetico di test, non utilizzabile come regola normativa.",
    };
    const stamp = "2026-10-28T09:00:00.000Z";
    const hash = "a".repeat(64);
    const id = "29000000-0000-4000-8000-000000000001";
    const signature: [number, number][][] = [
      [
        [0.1, 0.1],
        [0.2, 0.3],
        [0.3, 0.2],
        [0.4, 0.5],
        [0.5, 0.2],
        [0.6, 0.3],
      ],
    ];
    const people = [1, 2].map((n) => ({
      name: `Genitore sintetico ${n}`,
      role: "parent" as const,
      contact: `genitore${n}@example.invalid`,
      verification_method: "Verifica sintetica senza documenti reali",
      verified_by: id,
      verified_at: stamp,
    }));
    const snapshot = {
      schema: 1 as const,
      studio: "Studio sintetico",
      timezone: "Europe/Rome",
      client_name: "Minore sintetica",
      service_name: "Lip Blush",
      starts_at: "2026-10-30T09:00:00Z",
      consent: {
        id,
        revision: 1,
        title: content.title,
        body: content.description + "\n" + content.treatment_statement,
        content_hash: hash,
      },
      anamnesis: {
        id,
        revision: 1,
        title: "Anamnesi sintetica",
        body: content.introduction,
        questions: content.questions,
        content_hash: hash,
      },
      answers: Object.fromEntries(
        content.questions.map((q) => [q.id, q.type === "yes_no" ? false : ""]),
      ),
      lots: [],
      packet: {
        schema: "glow-pmu-v1",
        content,
        professional: {
          legal_name: "Operatrice sintetica",
          tax_id: "TEST0000",
          data_controller: "Titolare sintetico",
          address: "Via sintetica 1",
          email: "studio@example.invalid",
          phone: "000000000",
          pec: "",
        },
        details: {
          date_of_birth: "2010-01-01",
          birthplace: "Luogo sintetico",
          session_kind: "first",
          identity_verified: true,
          verification_method: "Verifica sintetica senza documenti reali",
          representatives: people.map(
            ({ name, role, contact, verification_method }) => ({
              name,
              role,
              contact,
              verification_method,
              verified: true,
            }),
          ),
        },
        package_hash: hash,
        health_receipts: people.map((signer) => ({
          allowed: true,
          at: stamp,
          signer,
          statement: content.health_statement,
          privacy_notice: content.privacy_notice,
          package_hash: hash,
        })),
      },
    };
    const payload: SignedPayload = {
      snapshot,
      snapshot_hash: hash,
      signer_name: people[0].name,
      signature,
      signed_at: stamp,
      statement: "Consenso sintetico di test",
      signature_kind: "drawn-v1",
      photo_choices: { documentation: true, demonstration: false },
      packet_signatures: people.map((signer) => ({
        signer,
        at: stamp,
        snapshot_hash: hash,
        input: {
          request_id: id,
          snapshot_hash: hash,
          confirmed: true,
          aftercare_received: true,
          authority_confirmed: true,
          signature,
          photo_documentation: true,
          photo_demonstration: false,
          photo_scope: "none",
        },
        treatment_statement: content.treatment_statement,
        aftercare_statement: content.aftercare_statement,
        guardian_statement: content.guardian_statement,
      })),
      counter_signature: {
        name: "Operatrice sintetica",
        actor_id: id,
        at: stamp,
        snapshot_hash: hash,
        signature,
        statement: "Verifica professionale sintetica",
      },
    };
    const first = await renderConsentPdf(id, hash, payload, [], "glow-pdf-v3");
    const second = await renderConsentPdf(id, hash, payload, [], "glow-pdf-v3");
    expect(first.sha256).toBe(second.sha256);
    expect(first.bytes).toEqual(second.bytes);
    const text = execFileSync("pdftotext", ["-", "-"], {
      input: first.bytes,
      encoding: "utf8",
    }).replace(/\s+/g, " ");
    for (const part of [
      "Genitore sintetico 1",
      "Genitore sintetico 2",
      "Persona rappresentata: Minore sintetica",
      "Controfirma",
      "Operatrice sintetica",
      "herpes",
      "Nessun uso dimostrativo",
      "glow-pdf-v3",
      content.aftercare_statement,
    ])
      expect(text).toContain(part);
  }, 20000);
});
