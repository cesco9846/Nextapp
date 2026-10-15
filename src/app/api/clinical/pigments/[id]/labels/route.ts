import { z } from "zod";
import { filePreparationSchema } from "@/lib/contracts";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      filePreparationSchema.omit({ appointment_id: true }),
    );
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("prepare_pigment_label", {
      p_pigment_id: id,
      p_request_id: body.request_id,
      p_size: body.size_bytes,
      p_sha256: body.sha256,
      p_mime: body.mime_type,
    });
    checkDb(result.error);
    return json(
      result.data
        ? {
            id: result.data.id,
            state: result.data.state,
            bucket: result.data.bucket,
            upload_path: result.data.upload_path,
            expires_at: result.data.expires_at,
          }
        : null,
      201,
    );
  });
}
