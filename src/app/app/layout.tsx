import { redirect } from "next/navigation";
import { ApiError, checkDb } from "@/server/http";
import { requireWorkspace } from "@/server/session";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, profile } = await requireWorkspace().catch((error) => {
    if (error instanceof ApiError) {
      if (error.code === "AUTH_REQUIRED") redirect("/accedi");
      if (error.code === "ACCESS_REVOKED") redirect("/accesso-sospeso");
      if (error.code === "WORKSPACE_REQUIRED") redirect("/configurazione");
    }
    throw error;
  });
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
