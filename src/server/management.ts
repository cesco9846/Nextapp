import "server-only";
import { ApiError, checkDb } from "./http";
import { requireWorkspace } from "./session";
import { deletionStatusSchema } from "@/lib/management";

export function checkManagementError(
  error: { code?: string; message?: string } | null,
) {
  if (error?.message === "RESOURCE_IN_USE")
    throw new ApiError(
      409,
      "Non è possibile eliminare questo elemento: esistono dati collegati da conservare. Aggiorna la verifica e consulta i motivi del blocco.",
      "RESOURCE_IN_USE",
    );
  checkDb(error);
}
export async function inspectDeletion(
  kind: "clients" | "services",
  id: string,
) {
  const { db } = await requireWorkspace(true);
  const result = await db.rpc("inspect_deletion", { p_kind: kind, p_id: id });
  checkManagementError(result.error);
  return deletionStatusSchema.parse(result.data);
}
export async function deleteUnused(
  kind: "clients" | "services",
  id: string,
  body: { version: number; confirmation: string },
) {
  const { db } = await requireWorkspace(true);
  const result = await db.rpc("delete_unused_resource", {
    p_kind: kind,
    p_id: id,
    p_version: body.version,
    p_confirmation: body.confirmation,
  });
  checkManagementError(result.error);
  if (!result.data)
    throw new ApiError(
      409,
      "Eliminazione non confermata. Ricarica l’elenco e verifica lo stato.",
    );
  return { deleted: true };
}
