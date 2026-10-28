import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { signedPayloadSchema } from "@/lib/consents";
import { renderConsentPdf } from "@/documents/pdf-renderer";
import { ApiError, checkDb } from "./http";
import { documentAdmin, sha256, verifiedDocumentFile } from "./documents";
const claimSchema = z.object({
  id: z.uuid(),
  claim: z.uuid(),
  renderer: z.enum(["glow-pdf-v1", "glow-pdf-v2", "glow-pdf-v3"]),
  content_hash: z.string(),
  path: z.string(),
  payload: signedPayloadSchema,
  labels: z.array(
    z.object({ id: z.uuid(), path: z.string(), sha256: z.string() }),
  ),
});

// One bounded job, fenced by an expiring lease. A stable immutable object path
// and deterministic bytes let an upload survive a crash before SQL completion.
export async function processDocument(id: string) {
  const admin = documentAdmin();
  const claimed = await admin.rpc("claim_document_job", { p_id: id });
  checkDb(claimed.error);
  if (!claimed.data) return;
  await processClaimedDocument(claimed.data);
}

export async function processClaimedDocument(
  input: unknown,
  signal?: AbortSignal,
): Promise<boolean> {
  const job = claimSchema.parse(input);
  const admin = documentAdmin(signal);
  let reason: "render_failed" | "storage_failed" | "integrity_failed" =
    "render_failed";
  try {
    const labels: (Uint8Array | null)[] = [];
    for (const lot of job.payload.snapshot.lots) {
      if (lot.label_file_id === null && lot.label_sha256 === null) {
        labels.push(null);
        continue;
      }
      const file = job.labels.find(
        (f) => f.id === lot.label_file_id && f.sha256 === lot.label_sha256,
      );
      reason = "integrity_failed";
      if (!file) throw new Error("Historical label missing");
      reason = "storage_failed";
      let original: Uint8Array;
      try {
        original = await verifiedDocumentFile("glow-private", file, signal);
      } catch (error) {
        if (error instanceof ApiError && error.code === "DOCUMENT_INTEGRITY")
          reason = "integrity_failed";
        throw error;
      }
      reason = "render_failed";
      labels.push(
        await sharp(original, { limitInputPixels: 20000000 })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 85 })
          .toBuffer(),
      );
    }
    const rendered = await renderConsentPdf(
      job.id,
      job.content_hash,
      job.payload,
      labels,
      job.renderer,
    );
    reason = "storage_failed";
    const storage = admin.storage.from("glow-documents");
    const uploaded = await storage.upload(job.path, rendered.bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "0",
    });
    // An existing object is reused only after reading and verifying all bytes.
    // No worker, including one with a stale claim, overwrites a signed artifact.
    if (
      uploaded.error &&
      !["409", "400"].includes(String(uploaded.error.statusCode))
    )
      throw new Error("Upload failed");
    const downloaded = await storage.download(job.path);
    if (downloaded.error || !downloaded.data)
      throw new Error("Verification download failed");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    reason = "integrity_failed";
    if (
      sha256(bytes) !== rendered.sha256 ||
      bytes.length !== rendered.bytes.length
    )
      throw new Error("Immutable artifact differs");
    reason = "storage_failed";
    const done = await admin.rpc("complete_document_job", {
      p_id: job.id,
      p_claim: job.claim,
      p_sha256: rendered.sha256,
      p_size: bytes.length,
    });
    if (done.error?.code === "23514") reason = "integrity_failed";
    checkDb(done.error);
    return true;
  } catch {
    const failed = await documentAdmin(AbortSignal.timeout(5000)).rpc(
      "fail_document_job",
      {
        p_id: job.id,
        p_claim: job.claim,
        p_reason: reason,
      },
    );
    if (failed.error)
      console.error("Document worker acknowledgement unavailable", {
        id: job.id,
      });
    // No payload, signature, tokens or Storage URLs in logs.
    console.error("Document generation deferred", { id: job.id, reason });
    return false;
  }
}
