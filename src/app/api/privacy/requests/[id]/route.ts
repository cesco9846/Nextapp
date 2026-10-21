import { z } from "zod";
import { privacyRequestUpdate } from "@/lib/privacy";
import { handleApi, json, readBody } from "@/server/http";
import { checkPrivacyError } from "@/server/privacy";
import { requireWorkspace } from "@/server/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const body = await readBody(request, privacyRequestUpdate);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("update_privacy_request", {
      p_id: id,
      p_version: body.version,
      p_state: body.state,
      p_identity_verified: body.identity_verified,
      p_note: body.note ?? null!,
    });
    checkPrivacyError(result.error);
    return json(result.data);
  });
}
