import { privacySettingsInput } from "@/lib/privacy";
import { handleApi, json, readBody } from "@/server/http";
import { checkPrivacyError } from "@/server/privacy";
import { requireWorkspace } from "@/server/session";

export async function PUT(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, privacySettingsInput);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("save_privacy_settings", {
      p_version: body.version,
      p_rules: body.rules,
      p_notice: body.notice,
      p_contact_email: body.contact_email,
      p_reviewed: body.reviewed,
    });
    checkPrivacyError(result.error);
    return json(result.data);
  });
}
