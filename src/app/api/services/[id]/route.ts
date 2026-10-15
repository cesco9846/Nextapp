import { z } from "zod";
import { serviceSchema } from "@/lib/contracts";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(
      request,
      serviceSchema.extend({ active: z.boolean() }),
    );
    const { db } = await requireWorkspace(true);
    const { data, error } = await db
      .from("services")
      .update(body)
      .eq("id", id)
      .select()
      .maybeSingle();
    checkDb(error);
    if (!data) throw new ApiError(404, "Servizio non trovato.");
    return json(data);
  });
}
