import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { SignedPayload, Handwriting } from "@/lib/consents";
import {
  packetSnapshotSchema,
  partyReceiptSchema,
  counterReceiptSchema,
  sessionLabels,
} from "@/lib/packages";

export const RENDERER_VERSION = "glow-pdf-v1";
const fontPath = join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
);
let characterSet: Promise<Set<number>> | undefined;
export async function assertDocumentCharacters(value: unknown) {
  characterSet ??= readFile(fontPath).then(
    (bytes) => new Set(fontkit.create(bytes).characterSet),
  );
  const supported = await characterSet;
  function inspect(input: unknown) {
    if (typeof input === "string") {
      for (const char of input)
        if (!"\r\n\t".includes(char) && !supported.has(char.codePointAt(0)!))
          throw new Error("Unsupported document character");
    } else if (Array.isArray(input)) input.forEach(inspect);
    else if (input && typeof input === "object")
      Object.values(input).forEach(inspect);
  }
  inspect(value);
}
export async function renderConsentPdf(
  id: string,
  contentHash: string,
  payload: SignedPayload,
  labels: (Uint8Array | null)[],
  renderer: "glow-pdf-v1" | "glow-pdf-v2" | "glow-pdf-v3" = RENDERER_VERSION,
) {
  await assertDocumentCharacters(payload);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(fontPath), {
    customName: "NotoSansGlowV1",
    subset: true,
  });
  const stamp = new Date(payload.signed_at);
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
  pdf.setTitle("Consenso firmato — Glow");
  pdf.setAuthor(payload.snapshot.studio);
  pdf.setCreator(renderer);
  pdf.setProducer("Glow / pdf-lib 1.17.1");
  let page!: PDFPage,
    y = 0;
  const width = 595.28,
    height = 841.89,
    margin = 48,
    measure = width - margin * 2;
  const fresh = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  fresh();
  function line(text: string, size = 10) {
    if (y < margin + 25) fresh();
    page.drawText(text, {
      x: margin,
      y,
      size,
      font,
      color: rgb(0.15, 0.24, 0.21),
    });
    y -= size * 1.6;
  }
  function wrappedLines(text: string, size: number) {
    const result: string[] = [];
    for (const original of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (!original) {
        result.push("");
        continue;
      }
      let buffer = "";
      // Prefer complete words; split only tokens longer than the page measure.
      for (const token of original.replace(/\t/g, "    ").split(/(\s+)/)) {
        if (font.widthOfTextAtSize(buffer + token, size) > measure && buffer) {
          result.push(buffer.trimEnd());
          buffer = "";
        }
        for (const char of buffer ? token : token.trimStart()) {
          if (font.widthOfTextAtSize(buffer + char, size) > measure && buffer) {
            result.push(buffer);
            buffer = "";
          }
          buffer += char;
        }
      }
      if (buffer) result.push(buffer);
    }
    return result;
  }
  function paragraphHeight(text: string, size: number) {
    return wrappedLines(text, size).reduce(
      (total, row) => total + (row ? size * 1.6 : size),
      8,
    );
  }
  function paragraph(text: string, size = 10) {
    for (const row of wrappedLines(text, size)) {
      if (row) line(row, size);
      else y -= size;
    }
    y -= 8;
  }
  const s = payload.snapshot;
  const date = (value: string) =>
    new Intl.DateTimeFormat("it-IT", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: s.timezone,
    }).format(new Date(value));
  paragraph(s.studio, 18);
  paragraph("Consenso al trattamento", 16);
  paragraph(
    `Cliente: ${s.client_name}\nServizio: ${s.service_name}\nAppuntamento: ${date(s.starts_at)}`,
  );
  paragraph(`${s.consent.title} — versione ${s.consent.revision}`, 13);
  paragraph(s.consent.body);
  if (s.anamnesis) {
    paragraph(`${s.anamnesis.title} — versione ${s.anamnesis.revision}`, 13);
    paragraph(s.anamnesis.body);
    for (const q of s.anamnesis.questions) {
      paragraph(q.label, 11);
      const value = s.answers[q.id];
      paragraph(
        value === true
          ? "Sì"
          : value === false
            ? "No"
            : value === undefined
              ? "Non compilata (facoltativa)"
              : value,
      );
    }
  }
  if (labels.length !== s.lots.length)
    throw new Error("Missing historical labels");
  if (s.lots.length) paragraph("Pigmenti e lotti del trattamento", 13);
  for (let i = 0; i < s.lots.length; i++) {
    const lot = s.lots[i];
    paragraph(
      `${lot.brand} — ${lot.name}\nCodice: ${lot.code || "Non indicato"}\nLotto: ${lot.lot_number}\nScadenza: ${lot.expires_on}\n${lot.label_text}`,
    );
    const label = labels[i];
    if (lot.label_file_id === null && lot.label_sha256 === null) {
      if (label !== null) throw new Error("Unexpected historical label");
      paragraph("Foto dell’etichetta non allegata.");
      continue;
    }
    if (!label) throw new Error("Missing historical label");
    const image = await pdf.embedJpg(label);
    const scaled = image.scaleToFit(measure, 220);
    if (y - scaled.height < margin + 25) fresh();
    page!.drawImage(image, {
      x: margin,
      y: y! - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    y! -= scaled.height + 20;
  }
  if (renderer === "glow-pdf-v2") {
    if (!s.photo_policy || !payload.photo_choices)
      throw new Error("Missing photo choices");
    paragraph("Scelte facoltative sulle foto", 13);
    paragraph(s.photo_policy.notice);
    paragraph(s.photo_policy.documentation);
    paragraph(
      `Documentazione riservata: ${payload.photo_choices.documentation ? "Sì, autorizzo" : "No, non autorizzo"}`,
    );
    paragraph(s.photo_policy.demonstration);
    paragraph(
      `Uso dimostrativo: ${payload.photo_choices.demonstration ? "Sì, autorizzo" : "No, non autorizzo"}`,
    );
    paragraph(`Testo foto: ${s.photo_policy.version}`, 9);
  }
  if (renderer === "glow-pdf-v3") {
    const packet = packetSnapshotSchema.parse(s.packet);
    const signatures = (payload.packet_signatures ?? []).map((v) =>
      partyReceiptSchema.parse(v),
    );
    const counter = counterReceiptSchema.parse(payload.counter_signature);
    if (
      signatures.length !== packet.health_receipts.length ||
      signatures.some((v) => v.snapshot_hash !== payload.snapshot_hash) ||
      counter.snapshot_hash !== payload.snapshot_hash
    )
      throw new Error("Signature bundle mismatch");
    const professional = packet.professional;
    paragraph("Dati dello studio e della seduta", 13);
    paragraph(
      `${professional.legal_name}\nCodice fiscale / P. IVA: ${professional.tax_id}\nTitolare dati: ${professional.data_controller}\n${professional.address}\n${professional.email} · ${professional.phone}${professional.pec ? " · PEC: " + professional.pec : ""}`,
    );
    paragraph(
      `Cliente nata il ${packet.details.date_of_birth} a ${packet.details.birthplace}\nSeduta: ${sessionLabels[packet.details.session_kind]}\nAmbito dichiarato dallo studio: ${packet.content.jurisdiction}`,
    );
    if (signatures.some((receipt) => receipt.signer.role !== "self"))
      paragraph(
        `Requisiti applicati per minorenni: ${packet.content.minors_basis}\nEtà minima verificata dallo studio: ${packet.content.minimum_age} · Rappresentanti richiesti: ${packet.content.representatives_required}`,
      );
    paragraph("Indicazioni post-trattamento", 13);
    paragraph(packet.content.aftercare);
    paragraph("Informativa privacy", 13);
    paragraph(packet.content.privacy_notice);
    paragraph("Consenso ai dati relativi alla salute", 13);
    for (const health of packet.health_receipts) {
      paragraph(health.statement);
      paragraph(
        `${health.signer.name} · ${health.signer.role === "self" ? "Cliente" : health.signer.role === "parent" ? "Genitore" : "Tutore"}\n${health.allowed ? "Acconsente" : "Non acconsente"} · ${date(health.at)}\nVersione contenuti: ${health.package_hash}`,
      );
    }
    paragraph("Fotografie: scelte separate e facoltative", 13);
    paragraph(packet.content.photo_notice);
    paragraph(packet.content.photo_documentation);
    paragraph(packet.content.photo_demonstration);
    function signatureBlock(
      name: string,
      role: string,
      at: string,
      signature: Handwriting,
    ) {
      const heading = `${name} · ${role}\nFirma acquisita il ${date(at)}`;
      if (y - paragraphHeight(heading, 10) - measure / 3 - 30 < margin + 25)
        fresh();
      paragraph(heading);
      const boxY = y - measure / 3;
      page.drawRectangle({
        x: margin,
        y: boxY,
        width: measure,
        height: measure / 3,
        borderWidth: 0.5,
        borderColor: rgb(0.7, 0.77, 0.73),
      });
      for (const stroke of signature)
        for (let i = 1; i < stroke.length; i++)
          page.drawLine({
            start: {
              x: margin + stroke[i - 1][0] * measure,
              y: boxY + measure / 3 - (stroke[i - 1][1] * measure) / 3,
            },
            end: {
              x: margin + stroke[i][0] * measure,
              y: boxY + measure / 3 - (stroke[i][1] * measure) / 3,
            },
            thickness: 1.5,
            color: rgb(0.15, 0.24, 0.21),
          });
      y = boxY - 22;
    }
    for (const receipt of signatures) {
      paragraph("Dichiarazioni e firma", 13);
      paragraph(receipt.treatment_statement);
      paragraph(receipt.aftercare_statement);
      if (receipt.guardian_statement)
        paragraph(
          `${receipt.guardian_statement}\nPersona rappresentata: ${s.client_name}`,
        );
      paragraph(
        `Foto riservate: ${receipt.input.photo_documentation ? "Sì" : "No"}\nPortfolio/sito/social: ${receipt.input.photo_demonstration ? "Sì" : "No"}\nAmbito: ${receipt.input.photo_scope === "recognizable" ? "Immagine riconoscibile consentita" : receipt.input.photo_scope === "detail" ? "Solo dettaglio area trattata" : "Nessun uso dimostrativo"}`,
      );
      paragraph(
        `Verifica professionale del firmatario: ${receipt.signer.verification_method}\nRegistrata il ${date(receipt.signer.verified_at)}`,
      );
      signatureBlock(
        receipt.signer.name,
        receipt.signer.role === "self"
          ? "Cliente"
          : receipt.signer.role === "parent"
            ? "Genitore"
            : "Tutore",
        receipt.at,
        receipt.input.signature,
      );
    }
    paragraph("Controfirma dell’operatrice", 13);
    paragraph(counter.statement);
    signatureBlock(counter.name, "Operatrice", counter.at, counter.signature);
    paragraph(
      "Firme disegnate acquisite tramite Glow. Non sono firme digitali qualificate.",
      9,
    );
    paragraph(
      `Documento: ${id}\nContenuto SHA-256: ${contentHash}\nSnapshot sottoscritto: ${payload.snapshot_hash}\nRenderer: ${renderer}`,
      8,
    );
  } else {
    const signerDetails = `Nome e cognome del firmatario: ${payload.signer_name}\nFirma acquisita il ${date(payload.signed_at)}`;
    const disclaimer =
      "Firma disegnata acquisita tramite Glow. Non è una firma digitale qualificata.";
    const identity = `Documento: ${id}\nContenuto firmato SHA-256: ${contentHash}\nRenderer: ${renderer}`;
    const confirmationHeight =
      paragraphHeight("Conferma e firma", 13) +
      paragraphHeight(payload.statement, 10) +
      paragraphHeight(signerDetails, 10) +
      measure / 2.5 +
      22 +
      paragraphHeight(disclaimer, 9) +
      paragraphHeight(identity, 8);
    // Reserve the entire confirmation before drawing its heading: identifying
    // text must travel with the handwriting, including at a label page boundary.
    if (y - confirmationHeight < margin + 25) fresh();
    paragraph("Conferma e firma", 13);
    paragraph(payload.statement);
    paragraph(signerDetails);
    const boxY = y! - measure / 2.5;
    page!.drawRectangle({
      x: margin,
      y: boxY,
      width: measure,
      height: measure / 2.5,
      borderWidth: 0.5,
      borderColor: rgb(0.7, 0.77, 0.73),
    });
    for (const stroke of payload.signature)
      for (let i = 1; i < stroke.length; i++)
        page!.drawLine({
          start: {
            x: margin + stroke[i - 1][0] * measure,
            y: boxY + measure / 2.5 - (stroke[i - 1][1] * measure) / 2.5,
          },
          end: {
            x: margin + stroke[i][0] * measure,
            y: boxY + measure / 2.5 - (stroke[i][1] * measure) / 2.5,
          },
          thickness: 1.5,
          color: rgb(0.15, 0.24, 0.21),
        });
    y! = boxY - 22;
    paragraph(disclaimer, 9);
    paragraph(identity, 8);
  }
  for (const [i, p] of pdf.getPages().entries())
    p.drawText(`${i + 1} / ${pdf.getPageCount()}`, {
      x: margin,
      y: 24,
      font,
      size: 8,
    });
  await pdf.attach(
    Buffer.from(JSON.stringify(payload), "utf8"),
    "contenuto-firmato.json",
    {
      mimeType: "application/json",
      description: "Contenuti e firma acquisiti",
      creationDate: stamp,
      modificationDate: stamp,
    },
  );
  const bytes = await pdf.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  });
  if (bytes.length > 26214400)
    throw new Error("Document exceeds storage limit");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
