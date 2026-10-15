import { z } from "zod";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import {
  FILE_BUCKET,
  FILE_LINK_SECONDS,
  privateStorage,
} from "@/server/private-storage";
import { requireWorkspace } from "@/server/session";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    await readBody(request, z.object({}).strict());
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace();
    const allowed = await db.rpc("authorize_file_read", { p_id: id });
    checkDb(allowed.error);
    if (!allowed.data) throw new ApiError(404, "File non trovato.");
    const result = await privateStorage()
      .storage.from(FILE_BUCKET)
      .createSignedUrl(allowed.data, FILE_LINK_SECONDS);
    if (result.error || !result.data)
      throw new ApiError(503, "Il file non è disponibile. Riprova tra poco.");
    return json({ url: result.data.signedUrl, expires_in: FILE_LINK_SECONDS });
  });
}
