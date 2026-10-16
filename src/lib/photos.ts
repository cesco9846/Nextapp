import { z } from "zod";
import { filePreparationSchema } from "./contracts";
export const photoCategorySchema = z.enum(["before", "after", "healed"]);
export type PhotoCategory = z.infer<typeof photoCategorySchema>;
export const photoCategoryLabels: Record<PhotoCategory, string> = {
  before: "Prima",
  after: "Dopo",
  healed: "Guarito",
};
export const photoPreparationSchema = filePreparationSchema
  .extend({ appointment_id: z.uuid(), category: photoCategorySchema })
  .strict();
export type Photo = {
  id: string;
  file_id: string;
  appointment_id: string;
  category: PhotoCategory;
  created_at: string;
  version: number;
};
export type PhotoPermission = {
  id: string;
  appointment_id: string;
  purpose: "documentation" | "demonstration";
  allowed: boolean;
  revoked_at: string | null;
  signed_at: string;
  version: number;
};
export type PhotoGallery = {
  client: {
    id: string;
    first_name: string;
    last_name: string;
    archived_at: string | null;
  };
  appointments: {
    id: string;
    service_name: string;
    starts_at: string;
    status: string;
  }[];
  permissions: PhotoPermission[];
  photos: Photo[];
  has_more: boolean;
};
