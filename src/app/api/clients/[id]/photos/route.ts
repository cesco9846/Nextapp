import { z } from "zod";
import { photoPreparationSchema } from "@/lib/photos";
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
    if (!allowed.data) throw new ApiError(404, "Dossier non trovato.");
    const search = new URL(request.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(search.get("page") ?? 0);
    const appointment = search.get("appointment");
    if (appointment) z.uuid().parse(appointment);
    let query = db
      .from("photos")
      .select("id,file_id,appointment_id,category,created_at,version")
      .eq("client_id", id)
      .eq("state", "ready")
      .is("archived_at", null);
    if (appointment) query = query.eq("appointment_id", appointment);
    const [client, appointments, permissions, photos] = await Promise.all([
      db
        .from("clients")
        .select("id,first_name,last_name,archived_at")
        .eq("id", id)
        .maybeSingle(),
      db
        .from("appointments")
        .select("id,service_name,starts_at,status")
        .eq("client_id", id)
        .order("starts_at", { ascending: false })
        .limit(200),
      db
        .from("photo_permissions")
        .select(
          "id,appointment_id,purpose,allowed,revoked_at,signed_at,version",
        )
        .eq("client_id", id)
        .is("superseded_at", null),
      query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 12, page * 12 + 12),
    ]);
    for (const result of [client, appointments, permissions, photos])
      checkDb(result.error);
    if (!client.data) throw new ApiError(404, "Dossier non trovato.");
    return json({
      client: client.data,
      appointments: appointments.data ?? [],
      permissions: permissions.data ?? [],
      photos: (photos.data ?? []).slice(0, 12),
      has_more: (photos.data?.length ?? 0) > 12,
    });
  });
}
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, photoPreparationSchema);
    const { db } = await requireWorkspace();
    const result = await db.rpc("prepare_photo", {
      p_client_id: id,
      p_appointment_id: body.appointment_id,
      p_category: body.category,
      p_request_id: body.request_id,
      p_size: body.size_bytes,
      p_sha256: body.sha256,
      p_mime: body.mime_type,
    });
    checkDb(result.error);
    return json(result.data, 201);
  });
}
