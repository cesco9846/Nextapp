import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { publicLinkSource } from "@/lib/public-link-source";
import { ApiError } from "./http";

export function linkSource(request: Request) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const local = ["127.0.0.1", "localhost"].includes(url.hostname);
    return publicLinkSource(request.headers, {
      vercel: process.env.VERCEL === "1",
      local,
      key: local
        ? (process.env.TEST_SUPABASE_SERVICE_KEY ?? "")
        : (process.env.supabase_service_role_secret ??
          process.env.supabase_secret ??
          ""),
      proxySecret: process.env.GLOW_PROXY_SECRET,
    });
  } catch {
    throw new ApiError(
      503,
      "Il collegamento è temporaneamente non disponibile.",
      "LINK_SOURCE_UNAVAILABLE",
    );
  }
}

export function invokePublicLink(
  db: SupabaseClient<Database>,
  source: string,
  family: "intake" | "signature" | "packet" | "appointment",
  token: string,
  action: string,
  input: unknown = null,
  requestId: string | null = null,
) {
  return db.rpc("use_public_link", {
    p_source_hash: source,
    p_family: family,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_action: action,
    p_input: input as Json,
    p_request_id: requestId!,
  });
}
