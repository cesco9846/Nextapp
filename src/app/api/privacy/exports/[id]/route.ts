import { z } from "zod";
import { handleApi, json, requireSameOrigin } from "@/server/http";
import { checkPrivacyError, downloadPrivacyExport } from "@/server/privacy";
import { requireWorkspace } from "@/server/session";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleApi(async () =>
    downloadPrivacyExport(z.uuid().parse((await context.params).id)),
  );
}
export async function DELETE(request: Request, context: Context) {
  return handleApi(async () => {
    requireSameOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("access_privacy_export", {
      p_id: id,
      p_action: "revoke",
    });
    checkPrivacyError(result.error);
    return json(result.data);
  });
}
