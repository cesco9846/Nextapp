import { z } from "zod";
import { packetIssueSchema } from "@/lib/packages";
import { requireClinical } from "@/server/clinical";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
import { assertPackageText } from "@/server/package-text";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, c: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const [p, s] = await Promise.all([
      db.rpc("available_consent_packages", { p_appointment_id: id }),
      db.rpc("read_consent_packets", { p_appointment_id: id }),
    ]);
    checkDb(p.error);
    checkDb(s.error);
    return json({ packages: p.data, sessions: s.data });
  });
}
export async function POST(request: Request, c: Context) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const b = await readBody(request, packetIssueSchema);
    await assertPackageText(b.details);
    const { db } = await requireClinical();
    const r = await db.rpc("prepare_consent_packet", {
      p_request_id: b.request_id,
      p_appointment_id: id,
      p_appointment_version: b.appointment_version,
      p_package_version_id: b.package_version_id,
      p_details: b.details,
      p_lot_ids: b.lot_ids,
      p_mode: b.mode,
    });
    checkDb(r.error);
    if (b.mode === "tablet") {
      const data = z
        .object({ links: z.array(z.object({ token: z.string() })) })
        .parse(r.data);
      if (!data.links.length)
        throw new ApiError(
          409,
          "Avvia di nuovo il passaggio al tablet.",
          "HANDOFF_RETRY",
        );
      const ended = await db.auth.signOut({ scope: "local" });
      if (ended.error)
        throw new ApiError(
          503,
          "La disconnessione non è riuscita. Riprova prima di consegnare il tablet.",
          "HANDOFF_FAILED",
        );
    }
    return json(r.data, 201);
  });
}
