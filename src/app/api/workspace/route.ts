import { bootstrapSchema } from "@/lib/contracts";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { requireSession, requireWorkspace } from "@/server/session";

export async function GET() {
  return handleApi(async () => {
    const { db, profile } = await requireWorkspace();
    const [tenant, locations, services, operators] = await Promise.all([
      db.from("tenants").select("*").eq("id", profile.tenant_id).single(),
      db.from("locations").select("*").order("name"),
      db.from("services").select("*").order("name"),
      db.from("users").select("*").eq("active", true).order("display_name"),
    ]);
    [tenant, locations, services, operators].forEach((result) =>
      checkDb(result.error),
    );
    return json({
      profile,
      tenant: tenant.data,
      locations: locations.data,
      services: services.data,
      operators: operators.data,
    });
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, bootstrapSchema);
    const { db } = await requireSession();
    const { data, error } = await db.rpc("bootstrap_workspace", {
      p_name: body.name,
      p_display_name: body.display_name,
      p_location: body.location,
      p_service: body.service,
      p_duration: body.duration,
      p_price: body.price,
    });
    checkDb(error);
    return json({ tenant_id: data }, 201);
  });
}
