import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { TreatmentPreparation } from "@/features/clinical/treatment-preparation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner" && !profile.clinical_access)
    redirect("/app/impostazioni");
  return <TreatmentPreparation id={z.uuid().parse((await params).id)} />;
}
