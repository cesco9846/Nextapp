import { after } from "next/server";
import { z } from "zod";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { processDocument } from "@/server/document-worker";
export const maxDuration = 60;
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    await readBody(request, z.object({}).strict());
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("request_document_retry", { p_id: id });
    checkDb(r.error);
    after(() => processDocument(id));
    return json({ queued: true }, 202);
  });
}
