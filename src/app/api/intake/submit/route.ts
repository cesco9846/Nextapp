import { intakeSubmitSchema } from "@/lib/intake";
import { handleApi, json, readBody } from "@/server/http";
import { accessIntake } from "@/server/intake";
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = await readBody(request, intakeSubmitSchema);
    return json(await accessIntake(request, body.token, "submit", body));
  });
}
