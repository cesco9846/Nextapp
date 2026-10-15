import { locationSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, locationSchema);
    const { db, profile } = await requireWorkspace(true);
    const { data, error } = await db
      .from("locations")
      .insert({ ...body, tenant_id: profile.tenant_id })
      .select()
      .single();
    checkDb(error);
    return json(data, 201);
  });
}
