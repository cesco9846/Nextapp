import { z } from "zod";
import { checkDb, handleApi, json } from "@/server/http";
import { requireWorkspace } from "@/server/session";

export async function GET(request: Request) {
  return handleApi(async () => {
    const value = new URL(request.url).searchParams.get("year");
    const year = value
      ? z.coerce.number().int().min(1900).max(2200).parse(value)
      : undefined;
    const { db } = await requireWorkspace(true);
    const { data, error } = await db.rpc(
      "completed_report",
      year ? { p_year: year } : {},
    );
    checkDb(error);
    return json(data);
  });
}
