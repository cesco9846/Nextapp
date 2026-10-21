import { privacyRequestInput } from "@/lib/privacy";
import { handleApi, json, readBody } from "@/server/http";
import { createPrivacyExport } from "@/server/privacy";

export const maxDuration = 60;
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, privacyRequestInput);
    return json(await createPrivacyExport(body.id, body.client_id), 201);
  });
}
