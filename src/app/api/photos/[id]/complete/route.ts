import { z } from "zod";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";
import { completePrivateFile } from "@/server/private-storage";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    await readBody(request, z.object({}).strict());
    const { db, user } = await requireWorkspace();
    const photo = await db
      .from("photos")
      .select("file_id")
      .eq("id", id)
      .maybeSingle();
    checkDb(photo.error);
    if (!photo.data) throw new ApiError(404, "Foto non trovata.");
    const file = await db.rpc("file_for_completion", {
      p_id: photo.data.file_id,
    });
    checkDb(file.error);
    if (!file.data) throw new ApiError(404, "Foto non trovata.");
    await completePrivateFile(file.data, user.id);
    const result = await db.rpc("complete_photo", { p_id: id });
    checkDb(result.error);
    return json(result.data);
  });
}
