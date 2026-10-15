import { redirect } from "next/navigation";
import { serverSupabase } from "@/server/supabase";
import { checkDb } from "@/server/http";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/accedi");
  const { data: profile, error } = await db
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  checkDb(error);
  if (!profile) {
    const membership = await db.rpc("membership_state");
    checkDb(membership.error);
    if (membership.data === "inactive") redirect("/accesso-sospeso");
    redirect("/configurazione");
  }
  const [tenant, locations, services, operators] = await Promise.all([
    db.from("tenants").select("*").eq("id", profile.tenant_id).single(),
    db.from("locations").select("*").order("name"),
    db.from("services").select("*").order("name"),
    db.from("users").select("*").eq("active", true).order("display_name"),
  ]);
  [tenant, locations, services, operators].forEach((r) => checkDb(r.error));
  if (!tenant.data) throw new Error("Workspace unavailable");
  return (
    <AppShell
      initial={{
        profile,
        tenant: tenant.data,
        locations: locations.data ?? [],
        services: services.data ?? [],
        operators: operators.data ?? [],
      }}
    >
      {children}
    </AppShell>
  );
}
