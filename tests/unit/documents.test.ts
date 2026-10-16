import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { handwritingSchema, type SignedPayload } from "@/lib/consents";
import {
  assertDocumentCharacters,
  renderConsentPdf,
} from "@/documents/pdf-renderer";
const stroke: SignedPayload["signature"] = [
  [
    [0.1, 0.2],
    [0.2, 0.3],
    [0.3, 0.4],
    [0.4, 0.3],
    [0.5, 0.2],
    [0.6, 0.4],
  ],
];
export const signedFixture: SignedPayload = {
  snapshot: {
    schema: 1,
    studio: "Studio di prova",
    timezone: "Europe/Rome",
    client_name: "Elena di prova",
    service_name: "Trattamento dimostrativo",
    starts_at: "2026-10-17T08:00:00Z",
    consent: {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      revision: 1,
      title: "Consenso di prova",
      body: "È già così: qualità, più chiarezza e possibilità.\n".repeat(240),
      content_hash: "a".repeat(64),
    },
    anamnesis: {
      id: "aaaaaaaa-2222-4222-8222-222222222222",
      revision: 1,
      title: "Questionario",
      body: "Domande di prova",
      questions: [
        {
          id: "aaaaaaaa-3333-4333-8333-333333333333",
          label: "Risposta di prova",
          type: "yes_no",
          required: true,
        },
      ],
      content_hash: "b".repeat(64),
    },
    answers: { "aaaaaaaa-3333-4333-8333-333333333333": false },
    lots: [],
  },
  snapshot_hash: "c".repeat(64),
  signer_name: "Elena di prova",
  signature: stroke,
  signed_at: "2026-10-16T10:00:00.123Z",
  statement: "Ho letto e acconsento al trattamento.",
  signature_kind: "drawn-v1",
};
describe("Signed document invariants", () => {
  it("rejects point-only, out-of-bounds and excessive handwriting", () => {
    expect(
      handwritingSchema.safeParse([
        [
          [0.1, 0.2],
          [0.1, 0.2],
        ],
      ]).success,
    ).toBe(false);
    expect(
      handwritingSchema.safeParse([
        [
          [0.1, 0.2],
          [2, 0.2],
        ],
      ]).success,
    ).toBe(false);
    expect(
      handwritingSchema.safeParse(Array.from({ length: 41 }, () => stroke[0]))
        .success,
    ).toBe(false);
    expect(handwritingSchema.safeParse(stroke).success).toBe(true);
  });
  it("renders accents and long documents deterministically for crash recovery", async () => {
    const first = await renderConsentPdf(
      "aaaaaaaa-4444-4444-8444-444444444444",
      "d".repeat(64),
      signedFixture,
      [],
    );
    const retry = await renderConsentPdf(
      "aaaaaaaa-4444-4444-8444-444444444444",
      "d".repeat(64),
      signedFixture,
      [],
    );
    expect(first.sha256).toBe(retry.sha256);
    expect(first.bytes).toEqual(retry.bytes);
    const loaded = await PDFDocument.load(first.bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(4);
    const text = execFileSync("pdftotext", ["-", "-"], {
      input: first.bytes,
      encoding: "utf8",
    }).replace(/\s+/g, " ");
    expect(text).toContain("È già così: qualità, più chiarezza e possibilità.");
    expect(text).toContain("Elena di prova");
    expect(text).toContain("Non è una firma digitale qualificata");
    expect(text).toContain("Risposta di prova");
    expect(text).toContain("No");
    const pages = execFileSync("pdftotext", ["-", "-"], {
      input: first.bytes,
      encoding: "utf8",
    }).split("\f");
    const confirmation = pages.find((page) =>
      page.includes("Conferma e firma"),
    );
    expect(confirmation).toContain("Elena di prova");
    expect(confirmation).toContain("Firma acquisita il");
    expect(confirmation).toContain("Firma disegnata acquisita");
    expect(Buffer.from(first.bytes).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("refuses missing historical labels rather than generating incomplete evidence", async () => {
    const payload = structuredClone(signedFixture);
    payload.snapshot.lots = [
      {
        brand: "Prova",
        name: "Pigmento",
        code: "DEMO",
        lot_number: "LOT-1",
        expires_on: "2030-01-01",
        label_file_id: "aaaaaaaa-5555-4555-8555-555555555555",
        label_sha256: "f".repeat(64),
        label_text: "Etichetta",
        lot_version: 1,
        pigment_version: 1,
      },
    ];
    await expect(
      renderConsentPdf(
        "aaaaaaaa-4444-4444-8444-444444444444",
        "d".repeat(64),
        payload,
        [],
      ),
    ).rejects.toThrow("Missing historical labels");
  });
  it("detects unsupported text before the client is asked to sign", async () => {
    await expect(
      assertDocumentCharacters("È già così, qualità e possibilità."),
    ).resolves.toBeUndefined();
    await expect(assertDocumentCharacters("Testo con 🦄")).rejects.toThrow(
      "Unsupported document character",
    );
  });
});
