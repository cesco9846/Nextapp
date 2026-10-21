import { privacyRequestInput } from "@/lib/privacy";
import { handleApi, json, readBody } from "@/server/http";
import { checkPrivacyError } from "@/server/privacy";
import { requireWorkspace } from "@/server/session";

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, privacyRequestInput);
    const { db } = await requireWorkspace(true);
    const result = await db.rpc("create_privacy_request", {
      p_id: body.id,
      p_client_id: body.client_id,
    });
    checkPrivacyError(result.error);
    return json(result.data, 201);
  });
}
