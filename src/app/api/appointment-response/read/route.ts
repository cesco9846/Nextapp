import { responseReadSchema } from "@/lib/appointment-response";
import { handleApi, json, readBody } from "@/server/http";
import { accessAppointmentResponse } from "@/server/appointment-response";
export async function POST(request: Request) {
  return handleApi(async () => {
    const { token } = await readBody(request, responseReadSchema);
    return json(await accessAppointmentResponse(token, "read"));
  });
}
