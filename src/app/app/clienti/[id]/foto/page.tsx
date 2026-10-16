import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { PhotoGallery } from "@/features/photos/photo-gallery";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appuntamento?: string }>;
}) {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner" && !profile.clinical_access)
    redirect("/app/impostazioni");
  const selected = (await searchParams).appuntamento;
  return (
    <PhotoGallery
      clientId={z.uuid().parse((await params).id)}
      initialAppointment={z.uuid().optional().parse(selected)}
    />
  );
}
