import { handleApi, json } from "@/server/http";
import { checkPrivacyError } from "@/server/privacy";
import { requireWorkspace } from "@/server/session";
import { z } from "zod";

export async function GET(request: Request) {
  return handleApi(async () => {
    const { db } = await requireWorkspace(true);
    const params = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(1).max(10000);
    const requestsPage = page.parse(params.get("requestsPage") ?? 1);
    const exportsPage = page.parse(params.get("exportsPage") ?? 1);
    const results = await Promise.all([
      db.from("privacy_settings").select("*").maybeSingle(),
      db
        .from("privacy_requests")
        .select("*")
        .order("received_at", { ascending: false })
        .order("id")
        .range((requestsPage - 1) * 20, requestsPage * 20),
      db
        .from("privacy_exports")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range((exportsPage - 1) * 20, exportsPage * 20),
    ]);
    for (const result of results) checkPrivacyError(result.error);
    const requests = results[1].data?.slice(0, 20) ?? [];
    const exports = results[2].data?.slice(0, 20) ?? [];
    const ids = [
      ...new Set([...requests, ...exports].map((row) => row.client_id)),
    ];
    const clients = ids.length
      ? await db.from("clients").select("id,first_name,last_name").in("id", ids)
      : { data: [], error: null };
    checkPrivacyError(clients.error);
    return json({
      settings: results[0].data,
      requests,
      exports,
      clients: clients.data,
      moreRequests: (results[1].data?.length ?? 0) > 20,
      moreExports: (results[2].data?.length ?? 0) > 20,
    });
  });
}
