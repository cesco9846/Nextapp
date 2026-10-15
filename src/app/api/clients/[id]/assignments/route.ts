import { z } from "zod";
import { assignmentSchema } from "@/lib/contracts";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace(true);
    const client = await db
      .from("clients")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    checkDb(client.error);
    if (!client.data) throw new ApiError(404, "Cliente non trovata.");
    const { data, error } = await db
      .from("client_assignments")
      .select("*")
      .eq("client_id", id);
    checkDb(error);
    return json(data);
  });
}
export async function POST(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, assignmentSchema);
    const { db } = await requireWorkspace(true);
    const { data, error } = await db.rpc("set_client_assignment", {
      p_client_id: id,
      p_operator_id: body.operator_id,
      p_assigned: body.assigned,
      p_version: body.version,
    });
    checkDb(error);
    return json(data);
  });
}
