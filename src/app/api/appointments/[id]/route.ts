import { z } from "zod";
import { appointmentUpdateSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { version, ...data } = await readBody(
      request,
      appointmentUpdateSchema,
    );
    const { db } = await requireWorkspace();
    const result = await db.rpc("update_appointment", {
      p_id: id,
      p_version: version,
      p_data: data,
    });
    checkDb(result.error);
    return json(result.data);
  });
}
