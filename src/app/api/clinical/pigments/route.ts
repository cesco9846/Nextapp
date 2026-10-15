import { pigmentSchema } from "@/lib/clinical";
import { requireClinical, catalogSearch } from "@/server/clinical";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function GET(request: Request) {
  return handleApi(async () => {
    const { db } = await requireClinical();
    const { page, q, start, end } = catalogSearch(request);
    let query = db
      .from("pigments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id");
    if (q) query = query.ilike("name", `%${q}%`);
    const result = await query.range(start, end);
    checkDb(result.error);
    return json({ items: result.data ?? [], total: result.count ?? 0, page });
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, pigmentSchema);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("save_pigment", {
      p_request_id: body.request_id,
      p_id: body.id!,
      p_version: body.version,
      p_brand: body.brand,
      p_name: body.name,
      p_code: body.code,
      p_active: body.active,
    });
    checkDb(result.error);
    return json(result.data, body.id ? 200 : 201);
  });
}
