import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/session";
import { ClinicalCatalog } from "@/features/clinical/clinical-catalog";
export default async function Page() {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner" && !profile.clinical_access)
    redirect("/app/impostazioni");
  return <ClinicalCatalog />;
}
