import { z } from "zod";
import { templatePublishSchema } from "@/lib/clinical";
import { requireClinical, catalogSearch } from "@/server/clinical";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function GET(request: Request) {
  return handleApi(async () => {
    const { db } = await requireClinical();
    const { params, page, q, start, end } = catalogSearch(request);
    let query = db
      .from("clinical_templates")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id");
    if (params.has("kind"))
      query = query.eq(
        "kind",
        z.enum(["consent", "anamnesis"]).parse(params.get("kind")),
      );
    if (params.has("active"))
      query = query.eq(
        "active",
        z.enum(["true", "false"]).parse(params.get("active")) === "true",
      );
    if (params.has("service_id")) {
      const id = z.uuid().parse(params.get("service_id"));
      query = query.or(`service_id.is.null,service_id.eq.${id}`);
    }
    if (q) query = query.ilike("title", `%${q}%`);
    const result = await query.range(start, end);
    checkDb(result.error);
    return json({ items: result.data ?? [], total: result.count ?? 0, page });
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, templatePublishSchema);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("publish_clinical_template", {
      p_request_id: body.request_id,
      p_template_id: body.template_id!,
      p_version: body.version,
      p_kind: body.kind,
      p_title: body.title,
      p_body: body.body,
      p_questions: body.questions,
      p_service_id: body.service_id!,
    });
    checkDb(result.error);
    return json(result.data, 201);
  });
}
