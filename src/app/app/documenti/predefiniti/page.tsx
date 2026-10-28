import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/session";
import { PackageLibrary } from "@/features/packages/package-library";
export default async function Page() {
  const { profile } = await requireWorkspace();
  if (profile.role !== "owner") redirect("/app/documenti");
  return <PackageLibrary />;
}
