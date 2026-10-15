import { z } from "zod";
import { preparationContextSchema } from "@/lib/clinical";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    await readBody(request, z.object({}).strict());
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const result = await db.rpc("read_treatment_preparation", {
      p_appointment_id: id,
    });
    checkDb(result.error);
    return json(preparationContextSchema.parse(result.data));
  });
}
