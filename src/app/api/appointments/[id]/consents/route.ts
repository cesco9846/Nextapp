import { z } from "zod";
import { intakeIssueSchema, intakeCreatedSchema } from "@/lib/intake";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function GET(_: Request, c: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const [links, documents] = await Promise.all([
      db
        .from("consent_requests")
        .select("*")
        .eq("appointment_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("consents")
        .select("*")
        .eq("appointment_id", id)
        .order("signed_at", { ascending: false })
        .limit(30),
    ]);
    checkDb(links.error);
    checkDb(documents.error);
    return json({ links: links.data, documents: documents.data });
  });
}
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const body = await readBody(request, intakeIssueSchema);
    const { db } = await requireClinical();
    const result = await db.rpc("create_signature_request", {
      p_request_id: body.request_id,
      p_appointment_id: id,
      p_appointment_version: body.appointment_version,
      p_preparation_version: body.preparation_version,
      p_mode: "link",
    });
    checkDb(result.error);
    return json(intakeCreatedSchema.parse(result.data), 201);
  });
}
