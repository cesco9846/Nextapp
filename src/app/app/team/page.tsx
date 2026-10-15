import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/session";
import { TeamSettings } from "@/features/team/team-settings";

export default async function TeamPage() {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner") redirect("/app/impostazioni");
  return <TeamSettings />;
}
