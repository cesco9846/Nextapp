import { z } from "zod";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, readBody } from "@/server/http";
import { privateBinary, verifiedDocumentFile } from "@/server/documents";
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    await readBody(request, z.object({}).strict());
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("read_consent_file", { p_id: id });
    checkDb(r.error);
    return privateBinary(
      await verifiedDocumentFile("glow-documents", r.data),
      "application/pdf",
      true,
    );
  });
}
