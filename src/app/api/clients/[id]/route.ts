import { z } from "zod";
import { archiveSchema, clientUpdateSchema } from "@/lib/contracts";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace();
    const [client, appointments] = await Promise.all([
      db.from("clients").select("*").eq("id", id).maybeSingle(),
      db
        .from("appointments")
        .select(
          "*, location:locations(id,name,color), operator:users(id,display_name)",
        )
        .eq("client_id", id)
        .order("starts_at", { ascending: false })
        .limit(25),
    ]);
    checkDb(client.error);
    checkDb(appointments.error);
    if (!client.data) throw new ApiError(404, "Cliente non trovata.");
    return json({ client: client.data, appointments: appointments.data ?? [] });
  });
}
export async function PATCH(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      z.union([archiveSchema, clientUpdateSchema]),
    );
    const { db } = await requireWorkspace();
    const { version, ...changes } = body;
    const { data, error } = await db.rpc("update_client", {
      p_id: id,
      p_version: version,
      p_data: changes,
    });
    checkDb(error);
    return json(data);
  });
}
