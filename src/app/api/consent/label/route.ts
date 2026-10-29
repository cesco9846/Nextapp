import { z } from "zod";
import { intakeTokenSchema } from "@/lib/intake";
import { handleApi, readBody } from "@/server/http";
import { privateBinary, accessSignature } from "@/server/documents";
export async function POST(request: Request) {
  return handleApi(async () => {
    const b = await readBody(
      request,
      z.object({ token: intakeTokenSchema, id: z.uuid() }).strict(),
    );
    const result = await accessSignature(request, b.token, "label", {
      id: b.id,
    });
    if (!("image" in result) || !result.image || !result.mime)
      throw new Error("Label unavailable");
    return privateBinary(result.image, result.mime);
  });
}
