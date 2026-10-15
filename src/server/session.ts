import "server-only";
import { serverSupabase } from "./supabase";
import { ApiError, checkDb } from "./http";

export async function requireSession() {
  const db = await serverSupabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new ApiError(
      401,
      "La sessione è scaduta. Accedi di nuovo.",
      "AUTH_REQUIRED",
    );
  return { db, user };
}
export async function requireWorkspace(owner = false) {
  const { db, user } = await requireSession();
  const { data: profile, error } = await db
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  checkDb(error);
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
