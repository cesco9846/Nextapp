import { z } from "zod";
import { lotSchema } from "@/lib/clinical";
import { requireClinical, catalogSearch } from "@/server/clinical";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function GET(request: Request) {
  return handleApi(async () => {
    const { db } = await requireClinical();
    const { params, page, q, start, end } = catalogSearch(request);
    let query = db
      .from("pigment_lots")
      .select("*,pigment:pigments!inner(id,brand,name,code,active)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .order("id");
    if (q) query = query.ilike("lot_number", `%${q}%`);
    if (params.has("pigment_id"))
      query = query.eq("pigment_id", z.uuid().parse(params.get("pigment_id")));
    const result = await query.range(start, end);
    checkDb(result.error);
    return json({ items: result.data ?? [], total: result.count ?? 0, page });
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, lotSchema);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("save_pigment_lot", {
      p_request_id: body.request_id,
      p_id: body.id!,
      p_version: body.version,
      p_pigment_id: body.pigment_id,
      p_lot_number: body.lot_number,
      p_expires_on: body.expires_on,
      p_label_file_id: body.label_file_id,
      p_label_text: body.label_text,
      p_active: body.active,
    });
    checkDb(result.error);
    return json(result.data, body.id ? 200 : 201);
  });
}
