import { after } from "next/server";
import { signatureSubmitSchema } from "@/lib/consents";
import { handleApi, json, readBody } from "@/server/http";
import { accessSignature } from "@/server/documents";
import { processDocument } from "@/server/document-worker";
export const maxDuration = 60;
export async function POST(request: Request) {
  return handleApi(async () => {
    const { token, ...input } = await readBody(request, signatureSubmitSchema);
    const result = await accessSignature(token, "sign", input);
    if ("receipt" in result && result.receipt)
      after(() => processDocument(result.receipt!.id));
    return json(result);
  });
}
