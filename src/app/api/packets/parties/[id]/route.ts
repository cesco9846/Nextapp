import { z } from "zod";
import { requireClinical } from "@/server/clinical";
import { ApiError, checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const body = await readBody(
      request,
      z.object({ tablet: z.boolean().optional() }).strict(),
    );
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("rotate_packet_party", { p_id: id });
    checkDb(r.error);
    if (body.tablet) {
      const ended = await db.auth.signOut({ scope: "local" });
      if (ended.error)
        throw new ApiError(
          503,
          "Disconnessione non riuscita. Riprova prima di consegnare il tablet.",
          "HANDOFF_FAILED",
        );
    }
    return json(r.data);
  });
}
