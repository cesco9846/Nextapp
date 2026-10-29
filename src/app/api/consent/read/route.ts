import { intakeReadSchema } from "@/lib/intake";
import { handleApi, json, readBody } from "@/server/http";
import { accessSignature } from "@/server/documents";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(request, intakeReadSchema);
    return json(await accessSignature(request, b.token, "read"));
  });
}
