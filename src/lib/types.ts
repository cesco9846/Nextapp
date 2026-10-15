import type { Database } from "./database.types";
import type { AppointmentStatus } from "./contracts";

export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Client = Row<"clients">;
export type Service = Row<"services">;
export type Location = Row<"locations">;
export type Profile = Row<"users">;
export type Invitation = Pick<
  Row<"user_invitations">,
  | "id"
  | "email"
  | "role"
  | "clinical_access"
  | "created_at"
  | "expires_at"
  | "accepted_at"
  | "revoked_at"
>;
export type Team = { members: Profile[]; invitations: Invitation[] };
export type CreatedInvitation = {
  id: string;
  email: string;
  clinical_access: boolean;
  expires_at: string;
  token: string;
};
export type Workspace = {
  profile: Profile;
  tenant: Row<"tenants">;
  locations: Location[];
  services: Service[];
  operators: Profile[];
};
export type Appointment = Omit<Row<"appointments">, "status"> & {
  status: AppointmentStatus;
  client: Pick<Client, "id" | "first_name" | "last_name" | "email" | "phone">;
  location: Pick<Location, "id" | "name" | "color">;
  operator: Pick<Profile, "id" | "display_name">;
};
export type ClientPage = {
  clients: Client[];
  total: number;
  page: number;
  pageSize: number;
};
