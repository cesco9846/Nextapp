import { requireWorkspace } from "@/server/session";
import { handleApi, json } from "@/server/http";

export async function GET() {
  return handleApi(async () => {
    const { profile } = await requireWorkspace();
    return json(profile);
  });
}
