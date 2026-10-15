import { z } from "zod";
import { versionSchema } from "@/lib/clinical";
import { requireClinical } from "@/server/clinical";
import { ApiError, checkDb, handleApi, json } from "@/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const result = await db
      .from("clinical_template_versions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    checkDb(result.error);
    if (!result.data) throw new ApiError(404, "Versione non trovata.");
    return json(versionSchema.parse(result.data));
  });
}
