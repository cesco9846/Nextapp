import { z } from "zod";
import { clientSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function GET(request: Request) {
  return handleApi(async () => {
    const { db } = await requireWorkspace();
    const search = new URL(request.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(search.get("page") ?? 1);
    const pageSize = 50;
    const q = z
      .string()
      .max(100)
      .parse(search.get("q") ?? "")
      .trim();
    let query = db
      .from("clients")
      .select("*", { count: "exact" })
      .order("last_name")
      .order("first_name")
      .order("id");
    if (search.get("archived") === "true")
      query = query.not("archived_at", "is", null);
    else query = query.is("archived_at", null);
    if (q)
      query = query.ilike("search_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, count, error } = await query.range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    checkDb(error);
    return json({ clients: data ?? [], total: count ?? 0, page, pageSize });
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, clientSchema);
    const { db, profile } = await requireWorkspace();
    const { data, error } = await db
      .from("clients")
      .insert({ ...body, tenant_id: profile.tenant_id })
      .select()
      .single();
    checkDb(error);
    return json(data, 201);
  });
}
