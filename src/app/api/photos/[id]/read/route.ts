import { z } from "zod";
import { checkDb, handleApi, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
import { privateBinary, verifiedDocumentFile } from "@/server/documents";
const fileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number(),
  mime: z.string(),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    await readBody(request, z.object({}).strict());
    const { db } = await requireWorkspace();
    const result = await db.rpc("read_photo", { p_id: id });
    checkDb(result.error);
    const file = fileSchema.parse(result.data);
    const bytes = await verifiedDocumentFile("glow-private", file);
    // Recheck access after the download: a suspended/removed clinician gets no bytes.
    const current = await db.rpc("read_photo", { p_id: id });
    checkDb(current.error);
    return privateBinary(bytes, file.mime);
  });
}
