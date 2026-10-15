import { z } from "zod";
import { filePreparationSchema } from "@/lib/contracts";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace();
    const allowed = await db.rpc("can_access_client_clinical", {
      p_client_id: id,
    });
    checkDb(allowed.error);
    if (!allowed.data) throw new ApiError(404, "Cliente non trovata.");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(new URL(request.url).searchParams.get("page") ?? 0);
    const result = await db
      .from("stored_files")
      .select(
        "id,client_id,appointment_id,state,mime_type,size_bytes,width,height,created_at",
      )
      .eq("client_id", id)
      .eq("state", "ready")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * 50, page * 50 + 50);
    checkDb(result.error);
    return json({
      files: (result.data ?? []).slice(0, 50),
      has_more: (result.data?.length ?? 0) > 50,
    });
  });
}
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, filePreparationSchema);
    const { db } = await requireWorkspace();
    const result = await db.rpc("prepare_client_file", {
      p_client_id: id,
      p_request_id: body.request_id,
      p_size: body.size_bytes,
      p_sha256: body.sha256,
      p_mime: body.mime_type,
      ...(body.appointment_id ? { p_appointment_id: body.appointment_id } : {}),
    });
    checkDb(result.error);
    if (!result.data) throw new ApiError(500, "Caricamento non disponibile.");
    return json(
      {
        id: result.data.id,
        state: result.data.state,
        bucket: result.data.bucket,
        upload_path: result.data.upload_path,
        expires_at: result.data.expires_at,
      },
      201,
    );
  });
}
