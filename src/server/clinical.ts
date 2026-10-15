import "server-only";
import { z } from "zod";
import { ApiError } from "./http";
import { requireWorkspace } from "./session";
export async function requireClinical() {
  const context = await requireWorkspace();
  if (context.profile.role !== "owner" && !context.profile.clinical_access)
    throw new ApiError(403, "Non hai accesso ai documenti di trattamento.");
  return context;
}
export function catalogSearch(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") ?? 1);
  const q = z
    .string()
    .max(100)
    .parse(params.get("q") ?? "")
    .trim()
    .replace(/[\\%_]/g, "\\$&");
  return { params, page, q, start: (page - 1) * 50, end: page * 50 - 1 };
}
