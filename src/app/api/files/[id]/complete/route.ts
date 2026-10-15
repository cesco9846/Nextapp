import { z } from "zod";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { completePrivateFile } from "@/server/private-storage";
import { requireWorkspace } from "@/server/session";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    await readBody(request, z.object({}).strict());
    const id = z.uuid().parse((await context.params).id);
    const { db, user } = await requireWorkspace();
    const file = await db.rpc("file_for_completion", { p_id: id });
    checkDb(file.error);
    if (!file.data) throw new ApiError(404, "File non trovato.");
    return json(await completePrivateFile(file.data, user.id));
  });
}
