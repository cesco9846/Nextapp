import "server-only";
import { serverSupabase } from "./supabase";
import { ApiError, checkDb } from "./http";
import { measureRequest } from "./request-timing";
import { cache } from "react";
import { z } from "zod";

// Live Auth lookup remains available for invitations and owner-only actions.
export const requireSession = cache(async function requireSession() {
  const db = await serverSupabase();
  const {
    data: { user },
    error,
  } = await measureRequest("auth", () => db.auth.getUser());
  if (error || !user)
    throw new ApiError(
      401,
      "La sessione è scaduta. Accedi di nuovo.",
      "AUTH_REQUIRED",
    );
  return { db, user };
});

const requireClaimsSession = cache(async () => {
  const db = await serverSupabase();
  const { data, error } = await measureRequest("auth", () =>
    db.auth.getClaims(),
  );
  const id = z.uuid().safeParse(data?.claims.sub);
  const session = z.uuid().safeParse(data?.claims.session_id);
  const issuer = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")}/auth/v1`;
  const audience = data?.claims.aud;
  if (
    error ||
    !id.success ||
    !session.success ||
    data?.claims.iss !== issuer ||
    !(
      audience === "authenticated" ||
      (Array.isArray(audience) && audience.includes("authenticated"))
    )
  )
    throw new ApiError(
      401,
      "La sessione è scaduta. Accedi di nuovo.",
      "AUTH_REQUIRED",
    );
  return { db, user: { id: id.data } };
});

const sessionProfile = cache(async () => {
  const db = await serverSupabase();
  const result = await measureRequest("profile", async () =>
    db.rpc("session_profile").maybeSingle(),
  );
  if (result.error?.code === "28000")
    throw new ApiError(
      401,
      "La sessione è scaduta. Accedi di nuovo.",
      "AUTH_REQUIRED",
    );
  checkDb(result.error);
  return result.data;
});
export async function requireWorkspace(owner = false) {
  const { db, user } = await (owner
    ? requireSession()
    : requireClaimsSession());
  const profile = await sessionProfile();
  if (profile && profile.id !== user.id)
    throw new ApiError(401, "Accedi di nuovo al tuo studio.", "AUTH_REQUIRED");
  if (!profile || !profile.active) {
    const state = await db.rpc("membership_state");
    checkDb(state.error);
    if (state.data === "inactive")
      throw new ApiError(
        403,
        "Il tuo accesso allo studio è stato sospeso. Contatta la titolare.",
        "ACCESS_REVOKED",
      );
    throw new ApiError(
      403,
      "Completa la configurazione del tuo studio.",
      "WORKSPACE_REQUIRED",
    );
  }
  if (owner && profile.role !== "owner")
    throw new ApiError(403, "Questa operazione è riservata al titolare.");
  return { db, user, profile };
}
