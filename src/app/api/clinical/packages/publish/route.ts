import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { checkDb, handleApi, json, readBody } from "@/server/http";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(
      request,
      z.object({ id: z.uuid(), version: z.number().int().positive() }).strict(),
    );
    const { db } = await requireWorkspace(true);
    const r = await db.rpc("publish_consent_package", {
      p_id: b.id,
      p_version: b.version,
    });
    checkDb(r.error);
    return json(r.data);
  });
}
