import { z } from "zod";
import { intakeCreatedSchema, intakeIssueSchema } from "@/lib/intake";
import { requireClinical } from "@/server/clinical";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const body = await readBody(request, intakeIssueSchema);
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("create_intake_link", {
      p_request_id: body.request_id,
      p_appointment_id: id,
      p_appointment_version: body.appointment_version,
      p_preparation_version: body.preparation_version,
      p_mode: "tablet",
    });
    checkDb(r.error);
    const result = intakeCreatedSchema.parse(r.data);
    if (!result.token)
      throw new ApiError(
        409,
        "Avvia un nuovo passaggio alla modalità cliente.",
        "HANDOFF_RETRY",
      );
    const ended = await db.auth.signOut({ scope: "local" });
    if (ended.error)
      throw new ApiError(
        503,
        "Non è stato possibile disconnettere lo studio. Riprova prima di consegnare il tablet.",
        "HANDOFF_FAILED",
      );
    return json(result, 201);
  });
}
