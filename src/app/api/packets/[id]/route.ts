import { after } from "next/server";
import { z } from "zod";
import { handwritingSchema } from "@/lib/consents";
import { requireClinical } from "@/server/clinical";
import { checkDb, handleApi, json, readBody } from "@/server/http";
import { processDocument } from "@/server/document-worker";
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const b = await readBody(
      request,
      z
        .object({
          snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
          confirmed: z.literal(true),
          signature: handwritingSchema,
        })
        .strict(),
    );
    const { db } = await requireClinical();
    const r = await db.rpc("countersign_consent_packet", {
      p_id: id,
      p_input: b,
    });
    checkDb(r.error);
    const receipt = z.object({ id: z.uuid() }).parse(r.data);
    after(() => processDocument(receipt.id));
    return json(receipt);
  });
}
export const maxDuration = 60;
export async function GET(_: Request, c: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const id = z.uuid().parse((await c.params).id);
    const { db } = await requireClinical();
    const r = await db.rpc("read_packet_review", { p_id: id });
    checkDb(r.error);
    return json(r.data);
  });
}
