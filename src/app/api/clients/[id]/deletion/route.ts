import { z } from "zod";
import { handleApi, json } from "@/server/http";
import { inspectDeletion } from "@/server/management";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () =>
    json(
      await inspectDeletion(
        "clients",
        z.uuid().parse((await context.params).id),
      ),
    ),
  );
}
