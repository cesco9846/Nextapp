import { responseSubmitSchema } from "@/lib/appointment-response";
import { handleApi, json, readBody } from "@/server/http";
import { accessAppointmentResponse } from "@/server/appointment-response";
export async function POST(request: Request) {
  return handleApi(async () => {
    const { token, action, request_id } = await readBody(
      request,
      responseSubmitSchema,
    );
    return json(await accessAppointmentResponse(token, action, request_id));
  });
}
