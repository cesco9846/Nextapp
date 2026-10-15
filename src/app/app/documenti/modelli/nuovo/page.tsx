import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/session";
import { TemplateEditor } from "@/features/clinical/template-editor";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner") redirect("/app/documenti");
  return (
    <TemplateEditor
      kind={(await searchParams).tipo === "anamnesis" ? "anamnesis" : "consent"}
    />
  );
}
