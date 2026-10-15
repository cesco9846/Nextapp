import { z } from "zod";
import {
  intakeCreatedSchema,
  intakeIssueSchema,
  intakeLinkSchema,
} from "@/lib/intake";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireClinical();
    const fields =
      "id,mode,created_at,expires_at,revoked_at,used_at,appointment_version,preparation_version,version";
    const [open, recent] = await Promise.all([
      db
        .from("intake_links")
        .select(fields)
        .eq("appointment_id", id)
        .is("revoked_at", null)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(2),
      db
        .from("intake_links")
        .select(fields)
        .eq("appointment_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    checkDb(open.error);
    checkDb(recent.error);
    const rows = [
      ...new Map(
        [...(open.data ?? []), ...(recent.data ?? [])].map((row) => [
          row.id,
          row,
        ]),
      ).values(),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json({ items: z.array(intakeLinkSchema).parse(rows) });
  });
}
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
      p_mode: "link",
    });
    checkDb(r.error);
    return json(intakeCreatedSchema.parse(r.data), 201);
  });
}
