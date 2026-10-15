import { z } from "zod";
import { activeSchema, versionSchema } from "@/lib/clinical";
import { requireClinical } from "@/server/clinical";
import { requireWorkspace } from "@/server/session";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const template = await db
      .from("clinical_templates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    checkDb(template.error);
    if (!template.data) throw new ApiError(404, "Modello non trovato.");
    const current = await db
      .from("clinical_template_versions")
      .select("*")
      .eq("id", template.data.current_version_id)
      .single();
    checkDb(current.error);
    const history = await db
      .from("clinical_template_versions")
      .select("id,revision,title,published_at")
      .eq("template_id", id)
      .order("revision", { ascending: false })
      .limit(10);
    checkDb(history.error);
    return json({
      template: template.data,
      current: versionSchema.parse(current.data),
      history: history.data ?? [],
    });
  });
}
export async function PATCH(request: Request, context: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, activeSchema);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("set_clinical_template_active", {
      p_id: id,
      p_version: body.version,
      p_active: body.active,
    });
    checkDb(result.error);
    return json(result.data);
  });
}
