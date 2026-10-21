import { z } from "zod";

export const workspaceNameSchema = z
  .object({
    name: z.string().trim().min(2, "Inserisci almeno due caratteri.").max(100),
    version: z.number().int().positive(),
  })
  .strict();
export const deletionInput = z
  .object({
    version: z.number().int().positive(),
    confirmation: z.literal("ELIMINA"),
  })
  .strict();
export const deletionStatusSchema = z.object({
  allowed: z.boolean(),
  version: z.number().int().positive(),
  reasons: z.array(
    z.enum([
      "appointments",
      "client_files",
      "clinical_records",
      "privacy_requests",
      "privacy_exports",
      "clinical_templates",
    ]),
  ),
});
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
export const deletionReasons: Record<
  DeletionStatus["reasons"][number],
  string
> = {
  appointments:
    "Sono presenti appuntamenti collegati, anche passati o annullati.",
  client_files:
    "Sono presenti foto o caricamenti collegati alla cliente, anche se non visibili in galleria.",
  clinical_records:
    "Il dossier contiene preparazioni, consensi o autorizzazioni da conservare.",
  privacy_requests:
    "Sono presenti richieste privacy da conservare nel registro.",
  privacy_exports:
    "È presente una copia export attiva o ancora da ripulire. Revoca il download nella gestione privacy e attendi la pulizia programmata.",
  clinical_templates:
    "Sono presenti modelli di documento collegati al servizio, anche disattivati.",
};
