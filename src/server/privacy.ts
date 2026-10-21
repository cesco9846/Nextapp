import "server-only";
import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import { csvRows, exportSnapshotSchema } from "@/lib/privacy";
import { ApiError, checkDb } from "./http";
import {
  documentAdmin,
  sha256,
  privateBinary,
  verifiedDocumentFile,
} from "./documents";
import { requireWorkspace } from "./session";

const EXPORT_BUCKET = "glow-exports";
const MAX_SIZE = 50 * 1024 * 1024;

export function checkPrivacyError(
  error: { code?: string; message?: string } | null,
) {
  if (error?.message === "EXPORT_EXPIRED")
    throw new ApiError(
      410,
      "Questa copia è scaduta o revocata. Crea un nuovo export.",
      "EXPORT_EXPIRED",
    );
  const reasons: Record<string, string> = {
    EXPORT_LIMIT:
      "Il dossier supera i limiti dell’export. Serve un’esportazione assistita; nessun file parziale è stato creato.",
    EXPORT_RETRY_LIMIT:
      "I tentativi disponibili sono terminati. Crea un nuovo export.",
    EXPORT_NOT_READY:
      "L’export non è ancora pronto. Aggiorna lo stato prima di riprovare.",
    INVALID_PRIVACY_SETTINGS:
      "Controlla tempi, motivazioni, contatto e informativa. Per segnare la revisione completa compila tutte le categorie.",
    INVALID_PRIVACY_REQUEST:
      "Controlla lo stato della richiesta e la verifica dell’identità.",
  };
  if (error?.code === "22023" && reasons[error.message ?? ""])
    throw new ApiError(422, reasons[error.message!], error.message);
  checkDb(error);
}

export async function createPrivacyExport(id: string, clientId: string) {
  const { db } = await requireWorkspace(true);
  const prepared = await db.rpc("prepare_privacy_export", {
    p_id: id,
    p_client_id: clientId,
  });
  checkPrivacyError(prepared.error);
  const job = z
    .object({
      export: z.object({ id: z.uuid(), state: z.string() }).passthrough(),
      claim: z.uuid().optional(),
      snapshot: z.unknown().optional(),
      path: z.string().optional(),
    })
    .parse(prepared.data);
  if (!job.claim) return job.export;
  const signal = AbortSignal.timeout(45000);
  const admin = documentAdmin(signal);
  let failure: "unavailable" | "limit_exceeded" | "integrity_failed" =
    "unavailable";
  try {
    const snapshot = exportSnapshotSchema.parse(job.snapshot);
    const portable = {
      ...snapshot,
      files: snapshot.files.map(({ id, name, sha256, size }) => ({
        id,
        name,
        sha256,
        size,
      })),
    };
    const entries: Record<string, Uint8Array> = {
      "dati.json": strToU8(JSON.stringify(portable, null, 2)),
      "cliente.csv": strToU8(
        csvRows(
          ["ID", "Nome", "Cognome", "Email", "Telefono"],
          [
            [
              snapshot.client.id,
              snapshot.client.first_name,
              snapshot.client.last_name,
              snapshot.client.email,
              snapshot.client.phone,
            ],
          ],
        ),
      ),
      "appuntamenti.csv": strToU8(
        csvRows(
          [
            "ID",
            "Inizio",
            "Fine",
            "Stato",
            "Servizio",
            "Sede",
            "Operatrice",
            "Prezzo in centesimi",
          ],
          snapshot.appointments.map((a) => [
            a.id,
            a.starts_at,
            a.ends_at,
            a.status,
            a.service_name,
            a.location_name,
            a.operator_name,
            a.price_cents,
          ]),
        ),
      ),
      "LEGGIMI.txt": strToU8(
        "Glow — export personale\nSnapshot alla data indicata in dati.json. I PDF in attesa o falliti sono indicati nei consensi; le prove firmate sono incluse nel JSON. Nessun contenuto in attesa di caricamento è incluso.\nOrari ISO 8601; importi in centesimi EUR. CSV UTF-8: i valori che potrebbero essere formule sono preceduti da apostrofo. Il JSON conserva i valori originali.\nL’archivio contiene dati riservati e non è cifrato: custodiscilo e consegnalo solo alla persona identificata usando un canale adeguato. La scadenza in Glow non elimina copie già scaricate.\n",
      ),
    };
    let size = Object.values(entries).reduce(
      (sum, bytes) => sum + bytes.length,
      0,
    );
    for (const file of snapshot.files) {
      if (signal.aborted) throw new Error("Export deadline");
      if ((size += file.size) > MAX_SIZE) {
        failure = "limit_exceeded";
        throw new Error("Export limit");
      }
      const bytes = await verifiedDocumentFile(file.bucket, file, signal);
      entries[file.name] = bytes;
    }
    const zip = zipSync(entries, {
      level: 0,
      mtime: new Date("2000-01-01T00:00:00Z"),
    });
    if (zip.length > MAX_SIZE) {
      failure = "limit_exceeded";
      throw new Error("Export limit");
    }
    const checksum = sha256(zip);
    const storage = admin.storage.from(EXPORT_BUCKET);
    // Recover an interrupted upload with exactly the same deterministic bytes.
    // Fixed entry mtime ensures retries do not alter archive hashes.
    const uploaded = await storage.upload(job.path!, zip, {
      contentType: "application/zip",
      cacheControl: "0",
      upsert: false,
    });
    if (uploaded.error) {
      const existing = await storage.download(job.path!);
      if (
        existing.error ||
        !existing.data ||
        sha256(new Uint8Array(await existing.data.arrayBuffer())) !== checksum
      ) {
        failure = "integrity_failed";
        throw new Error("Export storage integrity");
      }
    }
    const finished = await admin.rpc("finish_privacy_export", {
      p_id: id,
      p_claim: job.claim,
      p_sha256: checksum,
      p_size: zip.length,
    });
    checkDb(finished.error);
    if (!finished.data) throw new Error("Export no longer available");
    // Recheck the session after work, including owner suspension/revocation.
    const allowed = await db.rpc("access_privacy_export", {
      p_id: id,
      p_action: "read",
    });
    checkPrivacyError(allowed.error);
    return {
      ...job.export,
      state: "ready",
      sha256: checksum,
      size_bytes: zip.length,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "DOCUMENT_INTEGRITY")
      failure = "integrity_failed";
    // Separate deadline: a timed-out generation must still release its lease.
    await documentAdmin().rpc("finish_privacy_export", {
      p_id: id,
      p_claim: job.claim,
      p_sha256: null!,
      p_size: null!,
      p_failure: failure,
    });
    if (error instanceof ApiError && [401, 403, 410].includes(error.status))
      throw error;
    throw new ApiError(
      503,
      failure === "limit_exceeded"
        ? "Il dossier supera i limiti dell’export. Nessun archivio parziale è disponibile."
        : "Non è stato possibile preparare l’export. Aggiorna lo stato e riprova la stessa richiesta.",
      "EXPORT_FAILED",
    );
  }
}

export async function downloadPrivacyExport(id: string) {
  const { db } = await requireWorkspace(true);
  const result = await db.rpc("access_privacy_export", {
    p_id: id,
    p_action: "read",
  });
  checkPrivacyError(result.error);
  const file = z
    .object({ path: z.string(), sha256: z.string(), size: z.number() })
    .parse(result.data);
  const downloaded = await documentAdmin()
    .storage.from(EXPORT_BUCKET)
    .download(file.path);
  if (downloaded.error || !downloaded.data)
    throw new ApiError(
      503,
      "L’export non è disponibile. Aggiorna lo stato e riprova.",
    );
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (bytes.length !== file.size || sha256(bytes) !== file.sha256)
    throw new ApiError(503, "La verifica dell’export non è riuscita.");
  // Revocation may have happened while the object was downloading.
  const recheck = await db.rpc("access_privacy_export", {
    p_id: id,
    p_action: "read",
  });
  checkPrivacyError(recheck.error);
  const response = privateBinary(bytes, "application/zip");
  response.headers.set(
    "Content-Disposition",
    `attachment; filename="glow-export-${id}.zip"`,
  );
  return response;
}
