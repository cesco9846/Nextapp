import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "@/lib/database.types";
import { ApiError, checkDb } from "./http";

export const FILE_BUCKET = "glow-private";
export const FILE_LINK_SECONDS = 30;
const MAX_BYTES = 10 * 1024 * 1024;
const mimeFormats: Record<string, "jpeg" | "png" | "webp"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
type FileRow = Database["public"]["Tables"]["stored_files"]["Row"];

// Only Storage verification, signing and garbage collection use this client.
// Normal application writes and authorization remain under the user's session.
export function privateStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  if (!local && host !== "mexokvvvxdyekauupwvt.supabase.co")
    throw new ApiError(503, "Archivio privato non configurato.");
  const key = local
    ? process.env.TEST_SUPABASE_SERVICE_KEY
    : process.env.supabase_service_role_secret || process.env.supabase_secret;
  if (!key) throw new ApiError(503, "Archivio privato non configurato.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function fileSummary(file: FileRow) {
  return {
    id: file.id,
    client_id: file.client_id,
    appointment_id: file.appointment_id,
    state: file.state,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    width: file.width,
    height: file.height,
    sha256: file.sha256,
    created_at: file.created_at,
  };
}
const digest = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export async function completePrivateFile(file: FileRow, actor: string) {
  if (file.state === "ready") return fileSummary(file);
  const admin = privateStorage();
  const storage = admin.storage.from(FILE_BUCKET);
  const original = await storage.download(file.upload_path);
  if (original.error || !original.data)
    throw new ApiError(
      409,
      "Il caricamento non è disponibile. Attendi la fine dell’invio e riprova.",
      "FILE_NOT_UPLOADED",
    );
  const source = Buffer.from(await original.data.arrayBuffer());
  let failure: "content_mismatch" | "invalid_image" | undefined;
  let normalized: Buffer | undefined;
  let width = 0;
  let height = 0;
  if (
    source.length !== file.expected_size ||
    source.length > MAX_BYTES ||
    digest(source) !== file.expected_sha256
  ) {
    failure = "content_mismatch";
  } else {
    try {
      const image = sharp(source, {
        limitInputPixels: 20_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      const format = mimeFormats[file.mime_type];
      if (!format || metadata.format !== format || (metadata.pages ?? 1) > 1)
        throw new Error("Unsupported image");
      // Re-encode: decode the entire image, apply orientation and strip EXIF/GPS.
      const output = await image.rotate().toFormat(format).toBuffer({
        resolveWithObject: true,
      });
      if (!output.data.length || output.data.length > MAX_BYTES)
        throw new Error("Image size exceeds limit");
      normalized = output.data;
      width = output.info.width;
      height = output.info.height;
    } catch {
      failure = "invalid_image";
    }
  }
  if (failure || !normalized) {
    const rejected = await admin.rpc("reject_client_file", {
      p_id: file.id,
      p_actor: actor,
      p_reason: failure ?? "invalid_image",
    });
    checkDb(rejected.error);
    throw new ApiError(
      422,
      "Seleziona un’immagine statica JPEG, PNG o WebP valida, fino a 10 MB e 20 megapixel, e avvia un nuovo caricamento.",
      "INVALID_FILE",
    );
  }
  const checksum = digest(normalized);
  const uploaded = await storage.upload(file.object_path, normalized, {
    contentType: file.mime_type,
    cacheControl: "0",
    upsert: false,
  });
  if (uploaded.error) {
    // A previous completion may have uploaded the immutable object and lost its
    // response. Reuse it only after verifying its actual bytes, never overwrite.
    const existing = await storage.download(file.object_path);
    if (
      existing.error ||
      !existing.data ||
      digest(Buffer.from(await existing.data.arrayBuffer())) !== checksum
    )
      throw new ApiError(
        503,
        "Non è stato possibile completare il file. Riprova la stessa operazione.",
        "FILE_STORAGE_UNAVAILABLE",
      );
  }
  const result = await admin.rpc("finish_client_file", {
    p_id: file.id,
    p_actor: actor,
    p_sha256: checksum,
    p_size: normalized.length,
    p_width: width,
    p_height: height,
  });
  checkDb(result.error);
  if (!result.data) throw new ApiError(500, "File non disponibile.");
  // Best effort only. A leased cleanup job retries if deletion/acknowledgment
  // fails, including a crash immediately after finalization.
  await storage.remove([file.upload_path]).catch(() => undefined);
  return fileSummary(result.data);
}
