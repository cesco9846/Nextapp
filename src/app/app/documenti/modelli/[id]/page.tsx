import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { TemplateEditor } from "@/features/clinical/template-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner" && !profile.clinical_access)
    redirect("/app/impostazioni");
  return (
    <TemplateEditor id={z.uuid().parse((await params).id)} kind="consent" />
  );
}
