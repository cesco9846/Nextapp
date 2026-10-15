import { z } from "zod";
import { appointmentSchema } from "@/lib/contracts";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function GET(request: Request) {
  return handleApi(async () => {
    const params = new URL(request.url).searchParams;
    const start = z.iso.datetime({ offset: true }).parse(params.get("start"));
    const end = z.iso.datetime({ offset: true }).parse(params.get("end"));
    const duration = new Date(end).getTime() - new Date(start).getTime();
    if (duration <= 0 || duration > 42 * 86400000 + 3600000)
      throw new ApiError(400, "Seleziona un intervallo di massimo 42 giorni.");
    const { db } = await requireWorkspace();
    let query = db
      .from("appointments")
      .select(
        "*, client:clients(id,first_name,last_name,email,phone), location:locations(id,name,color), operator:users(id,display_name)",
      )
      .lt("starts_at", end)
      .gt("ends_at", start)
      .order("starts_at");
    const location = params.get("location");
    const operator = params.get("operator");
    if (location) query = query.eq("location_id", z.uuid().parse(location));
    if (operator) query = query.eq("operator_id", z.uuid().parse(operator));
    const { data, error } = await query;
    checkDb(error);
    return json(data ?? []);
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, appointmentSchema);
    const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
    const { db } = await requireWorkspace();
    const { data, error } = await db.rpc("create_appointment", {
      p_key: key,
      p_data: body,
    });
    checkDb(error);
    return json(data, 201);
  });
}
