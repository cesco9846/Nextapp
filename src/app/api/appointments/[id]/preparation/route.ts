import { z } from "zod";
import { preparationSaveSchema } from "@/lib/clinical";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, preparationSaveSchema);
    const { db } = await requireClinical();
    const result = await db.rpc("save_treatment_preparation", {
      p_request_id: body.request_id,
      p_appointment_id: id,
      p_appointment_version: body.appointment_version,
      p_version: body.version,
      p_consent_version_id: body.consent_version_id,
      p_anamnesis_version_id: body.anamnesis_version_id!,
      p_answers: body.answers,
      p_lot_ids: body.lot_ids,
    });
    checkDb(result.error);
    return json(result.data);
  });
}
