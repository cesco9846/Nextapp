import "server-only";
import { authenticateInvocation, reply } from "./scheduled-invocation";
import { processClaimedDocument } from "./document-worker";
import { cleanupFiles } from "@/documents/cleanup-worker";

export async function maintenanceInvocation(
  request: Request,
  kind: "documents" | "cleanup",
) {
  const invocation = await authenticateInvocation(request, kind);
  if (invocation instanceof Response) return invocation;
  const { db, nonce } = invocation;
  let started = false,
    processed = 0,
    failed = 0;
  try {
    const run = await db.rpc("start_maintenance_run", {
      p_kind: kind,
      p_run: nonce,
    });
    if (run.error) throw new Error();
    if (run.data === "disabled" || run.data === "busy")
      return reply({ mode: run.data, processed, failed });
    if (run.data !== "started") throw new Error();
    started = true;
    const signal = AbortSignal.timeout(45000);
    if (kind === "documents") {
      const claim = await db.rpc("claim_next_document_job").abortSignal(signal);
      if (claim.error) throw new Error();
      if (claim.data) {
        if (await processClaimedDocument(claim.data, signal)) processed++;
        else failed++;
      }
    } else {
      const result = await cleanupFiles(db, signal);
      processed = result.completed;
      failed = result.retry;
    }
    const finished = await db.rpc("finish_maintenance_run", {
      p_kind: kind,
      p_run: nonce,
      p_ok: failed === 0,
      p_processed: processed,
      p_failed: failed,
    });
    if (finished.error || finished.data !== true) throw new Error();
    return reply({ mode: "enabled", processed, failed }, failed ? 503 : 200);
  } catch {
    if (started)
      await db.rpc("finish_maintenance_run", {
        p_kind: kind,
        p_run: nonce,
        p_ok: false,
        p_processed: processed,
        p_failed: Math.max(failed, 1),
      });
    return reply({ status: "unavailable" }, 503);
  }
}
