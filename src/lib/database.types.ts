export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          client_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          location_id: string;
          operator_id: string;
          price_cents: number;
          schedule_revision: number;
          service_id: string;
          service_name: string;
          starts_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          client_id: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          location_id: string;
          operator_id: string;
          price_cents: number;
          schedule_revision?: number;
          service_id: string;
          service_name: string;
          starts_at: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          location_id?: string;
          operator_id?: string;
          price_cents?: number;
          schedule_revision?: number;
          service_id?: string;
          service_name?: string;
          starts_at?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_tenant_id_client_id_fkey";
            columns: ["tenant_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_operator_id_fkey";
            columns: ["tenant_id", "operator_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "appointments_tenant_id_service_id_fkey";
            columns: ["tenant_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          resource_id: string;
          resource_type: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          resource_id: string;
          resource_type: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          resource_id?: string;
          resource_type?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      client_assignments: {
        Row: {
          active: boolean;
          assigned_by: string;
          client_id: string;
          id: string;
          operator_id: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          assigned_by: string;
          client_id: string;
          id?: string;
          operator_id: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          assigned_by?: string;
          client_id?: string;
          id?: string;
          operator_id?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "client_assignments_tenant_id_assigned_by_fkey";
            columns: ["tenant_id", "assigned_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "client_assignments_tenant_id_client_id_fkey";
            columns: ["tenant_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "client_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_assignments_tenant_id_operator_id_fkey";
            columns: ["tenant_id", "operator_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      clients: {
        Row: {
          archived_at: string | null;
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          phone: string | null;
          search_name: string | null;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          phone?: string | null;
          search_name?: never;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          search_name?: never;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      clinical_template_versions: {
        Row: {
          body: string;
          content_hash: string;
          created_by: string;
          id: string;
          published_at: string;
          questions: NonNullable<Json>;
          revision: number;
          template_id: string;
          tenant_id: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          content_hash: string;
          created_by: string;
          id?: string;
          published_at?: string;
          questions?: NonNullable<Json>;
          revision: number;
          template_id: string;
          tenant_id: string;
          title: string;
        };
        Update: {
          body?: string;
          content_hash?: string;
          created_by?: string;
          id?: string;
          published_at?: string;
          questions?: NonNullable<Json>;
          revision?: number;
          template_id?: string;
          tenant_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_template_versions_tenant_id_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "clinical_template_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinical_template_versions_tenant_id_template_id_fkey";
            columns: ["tenant_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "clinical_templates";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      clinical_templates: {
        Row: {
          active: boolean;
          created_at: string;
          current_revision: number;
          current_version_id: string;
          id: string;
          kind: string;
          service_id: string | null;
          tenant_id: string;
          title: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          current_revision?: number;
          current_version_id: string;
          id?: string;
          kind: string;
          service_id?: string | null;
          tenant_id: string;
          title: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          current_revision?: number;
          current_version_id?: string;
          id?: string;
          kind?: string;
          service_id?: string | null;
          tenant_id?: string;
          title?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinical_templates_tenant_id_id_current_version_id_fkey";
            columns: ["tenant_id", "id", "current_version_id"];
            isOneToOne: false;
            referencedRelation: "clinical_template_versions";
            referencedColumns: ["tenant_id", "template_id", "id"];
          },
          {
            foreignKeyName: "clinical_templates_tenant_id_service_id_fkey";
            columns: ["tenant_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      locations: {
        Row: {
          active: boolean;
          address: string;
          color: string;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          address?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          appointment_id: string;
          attempts: number;
          channel: string;
          id: string;
          kind: string;
          next_attempt_at: string | null;
          provider_id: string | null;
          schedule_revision: number;
          scheduled_for: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          appointment_id: string;
          attempts?: number;
          channel?: string;
          id?: string;
          kind: string;
          next_attempt_at?: string | null;
          provider_id?: string | null;
          schedule_revision: number;
          scheduled_for: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string;
          attempts?: number;
          channel?: string;
          id?: string;
          kind?: string;
          next_attempt_at?: string | null;
          provider_id?: string | null;
          schedule_revision?: number;
          scheduled_for?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_tenant_id_appointment_id_fkey";
            columns: ["tenant_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      pigment_lots: {
        Row: {
          active: boolean;
          created_at: string;
          expires_on: string;
          id: string;
          label_file_id: string;
          label_text: string;
          lot_number: string;
          pigment_id: string;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          expires_on: string;
          id?: string;
          label_file_id: string;
          label_text?: string;
          lot_number: string;
          pigment_id: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          expires_on?: string;
          id?: string;
          label_file_id?: string;
          label_text?: string;
          lot_number?: string;
          pigment_id?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pigment_lots_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pigment_lots_tenant_id_label_file_id_fkey";
            columns: ["tenant_id", "label_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "pigment_lots_tenant_id_pigment_id_fkey";
            columns: ["tenant_id", "pigment_id"];
            isOneToOne: false;
            referencedRelation: "pigments";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      pigments: {
        Row: {
          active: boolean;
          brand: string;
          code: string;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          brand: string;
          code?: string;
          created_at?: string;
          id?: string;
          name: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          brand?: string;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pigments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          color: string;
          created_at: string;
          duration_minutes: number;
          id: string;
          name: string;
          price_cents: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          color?: string;
          created_at?: string;
          duration_minutes: number;
          id?: string;
          name: string;
          price_cents?: number;
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          color?: string;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          name?: string;
          price_cents?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stored_files: {
        Row: {
          appointment_id: string | null;
          bucket: string;
          cleanup_completed_at: string | null;
          cleanup_lease_until: string | null;
          cleanup_token: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at: string;
          failure_code: string | null;
          height: number | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          pigment_id: string | null;
          ready_at: string | null;
          request_id: string;
          sha256: string | null;
          size_bytes: number | null;
          staging_cleaned_at: string | null;
          state: string;
          tenant_id: string;
          upload_path: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          appointment_id?: string | null;
          bucket?: string;
          cleanup_completed_at?: string | null;
          cleanup_lease_until?: string | null;
          cleanup_token?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at?: string;
          failure_code?: string | null;
          height?: number | null;
          id?: string;
          kind?: string;
          mime_type: string;
          object_path: string;
          pigment_id?: string | null;
          ready_at?: string | null;
          request_id: string;
          sha256?: string | null;
          size_bytes?: number | null;
          staging_cleaned_at?: string | null;
          state?: string;
          tenant_id: string;
          upload_path: string;
          width?: number | null;
        };
        Update: {
          appointment_id?: string | null;
          bucket?: string;
          cleanup_completed_at?: string | null;
          cleanup_lease_until?: string | null;
          cleanup_token?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string;
          expected_sha256?: string;
          expected_size?: number;
          expires_at?: string;
          failure_code?: string | null;
          height?: number | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          object_path?: string;
          pigment_id?: string | null;
          ready_at?: string | null;
          request_id?: string;
          sha256?: string | null;
          size_bytes?: number | null;
          staging_cleaned_at?: string | null;
          state?: string;
          tenant_id?: string;
          upload_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stored_files_tenant_id_appointment_id_fkey";
            columns: ["tenant_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stored_files_tenant_id_client_id_fkey";
            columns: ["tenant_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stored_files_tenant_id_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stored_files_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stored_files_tenant_id_pigment_id_fkey";
            columns: ["tenant_id", "pigment_id"];
            isOneToOne: false;
            referencedRelation: "pigments";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          name: string;
          reminders_enabled: boolean;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          name: string;
          reminders_enabled?: boolean;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          name?: string;
          reminders_enabled?: boolean;
          timezone?: string;
        };
        Relationships: [];
      };
      treatment_lots: {
        Row: {
          id: string;
          lot_id: string;
          preparation_id: string;
          snapshot: NonNullable<Json>;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          lot_id: string;
          preparation_id: string;
          snapshot: NonNullable<Json>;
          tenant_id: string;
        };
        Update: {
          id?: string;
          lot_id?: string;
          preparation_id?: string;
          snapshot?: NonNullable<Json>;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "treatment_lots_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "treatment_lots_tenant_id_lot_id_fkey";
            columns: ["tenant_id", "lot_id"];
            isOneToOne: false;
            referencedRelation: "pigment_lots";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_lots_tenant_id_preparation_id_fkey";
            columns: ["tenant_id", "preparation_id"];
            isOneToOne: false;
            referencedRelation: "treatment_preparations";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      treatment_preparations: {
        Row: {
          anamnesis_version_id: string | null;
          appointment_id: string;
          appointment_version: number;
          client_id: string;
          consent_version_id: string;
          created_at: string;
          created_by: string;
          id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          anamnesis_version_id?: string | null;
          appointment_id: string;
          appointment_version: number;
          client_id: string;
          consent_version_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          anamnesis_version_id?: string | null;
          appointment_id?: string;
          appointment_version?: number;
          client_id?: string;
          consent_version_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "treatment_preparations_tenant_id_anamnesis_version_id_fkey";
            columns: ["tenant_id", "anamnesis_version_id"];
            isOneToOne: false;
            referencedRelation: "clinical_template_versions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_appointment_id_fkey";
            columns: ["tenant_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_client_id_fkey";
            columns: ["tenant_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_consent_version_id_fkey";
            columns: ["tenant_id", "consent_version_id"];
            isOneToOne: false;
            referencedRelation: "clinical_template_versions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "treatment_preparations_tenant_id_updated_by_fkey";
            columns: ["tenant_id", "updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      user_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          clinical_access: boolean;
          created_at: string;
          created_by: string;
          email: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          role: string;
          tenant_id: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          clinical_access?: boolean;
          created_at?: string;
          created_by: string;
          email: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          role?: string;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          clinical_access?: boolean;
          created_at?: string;
          created_by?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          role?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_invitations_tenant_id_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "user_invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          active: boolean;
          clinical_access: boolean;
          created_at: string;
          display_name: string;
          id: string;
          role: string;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          clinical_access?: boolean;
          created_at?: string;
          display_name: string;
          id: string;
          role: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          clinical_access?: boolean;
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_team_invitation: {
        Args: { p_display_name: string; p_token: string };
        Returns: string;
      };
      authorize_file_read: { Args: { p_id: string }; Returns: string };
      bootstrap_workspace: {
        Args: {
          p_display_name: string;
          p_duration: number;
          p_location: string;
          p_name: string;
          p_price: number;
          p_service: string;
        };
        Returns: string;
      };
      can_access_client_clinical: {
        Args: { p_client_id: string };
        Returns: boolean;
      };
      cancel_client_file: { Args: { p_id: string }; Returns: undefined };
      claim_file_cleanup: { Args: { p_limit?: number }; Returns: Json[] };
      complete_file_cleanup: {
        Args: { p_claim: string; p_id: string };
        Returns: undefined;
      };
      completed_report: { Args: { p_year?: number }; Returns: Json };
      create_appointment: {
        Args: { p_data: Json; p_key: string };
        Returns: {
          client_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          location_id: string;
          operator_id: string;
          price_cents: number;
          schedule_revision: number;
          service_id: string;
          service_name: string;
          starts_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_team_invitation: {
        Args: { p_clinical_access?: boolean; p_email: string };
        Returns: Json;
      };
      file_for_completion: {
        Args: { p_id: string };
        Returns: {
          appointment_id: string | null;
          bucket: string;
          cleanup_completed_at: string | null;
          cleanup_lease_until: string | null;
          cleanup_token: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at: string;
          failure_code: string | null;
          height: number | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          pigment_id: string | null;
          ready_at: string | null;
          request_id: string;
          sha256: string | null;
          size_bytes: number | null;
          staging_cleaned_at: string | null;
          state: string;
          tenant_id: string;
          upload_path: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "stored_files";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      finish_client_file: {
        Args: {
          p_actor: string;
          p_height: number;
          p_id: string;
          p_sha256: string;
          p_size: number;
          p_width: number;
        };
        Returns: {
          appointment_id: string | null;
          bucket: string;
          cleanup_completed_at: string | null;
          cleanup_lease_until: string | null;
          cleanup_token: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at: string;
          failure_code: string | null;
          height: number | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          pigment_id: string | null;
          ready_at: string | null;
          request_id: string;
          sha256: string | null;
          size_bytes: number | null;
          staging_cleaned_at: string | null;
          state: string;
          tenant_id: string;
          upload_path: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "stored_files";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      membership_state: { Args: Record<PropertyKey, never>; Returns: string };
      prepare_client_file: {
        Args: {
          p_appointment_id?: string;
          p_client_id: string;
          p_mime: string;
          p_request_id: string;
          p_sha256: string;
          p_size: number;
        };
        Returns: {
          appointment_id: string | null;
          bucket: string;
          cleanup_completed_at: string | null;
          cleanup_lease_until: string | null;
          cleanup_token: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at: string;
          failure_code: string | null;
          height: number | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          pigment_id: string | null;
          ready_at: string | null;
          request_id: string;
          sha256: string | null;
          size_bytes: number | null;
          staging_cleaned_at: string | null;
          state: string;
          tenant_id: string;
          upload_path: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "stored_files";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      prepare_pigment_label: {
        Args: {
          p_mime: string;
          p_pigment_id: string;
          p_request_id: string;
          p_sha256: string;
          p_size: number;
        };
        Returns: {
          appointment_id: string | null;
          bucket: string;
          cleanup_completed_at: string | null;
          cleanup_lease_until: string | null;
          cleanup_token: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string;
          expected_sha256: string;
          expected_size: number;
          expires_at: string;
          failure_code: string | null;
          height: number | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          pigment_id: string | null;
          ready_at: string | null;
          request_id: string;
          sha256: string | null;
          size_bytes: number | null;
          staging_cleaned_at: string | null;
          state: string;
          tenant_id: string;
          upload_path: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "stored_files";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      publish_clinical_template: {
        Args: {
          p_body: string;
          p_kind: string;
          p_questions: Json;
          p_request_id: string;
          p_service_id?: string;
          p_template_id: string;
          p_title: string;
          p_version: number;
        };
        Returns: {
          body: string;
          content_hash: string;
          created_by: string;
          id: string;
          published_at: string;
          questions: NonNullable<Json>;
          revision: number;
          template_id: string;
          tenant_id: string;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "clinical_template_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      read_treatment_preparation: {
        Args: { p_appointment_id: string };
        Returns: Json;
      };
      reject_client_file: {
        Args: { p_actor: string; p_id: string; p_reason: string };
        Returns: undefined;
      };
      revoke_team_invitation: { Args: { p_id: string }; Returns: undefined };
      save_pigment: {
        Args: {
          p_active: boolean;
          p_brand: string;
          p_code: string;
          p_id: string;
          p_name: string;
          p_request_id: string;
          p_version: number;
        };
        Returns: {
          active: boolean;
          brand: string;
          code: string;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "pigments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_pigment_lot: {
        Args: {
          p_active: boolean;
          p_expires_on: string;
          p_id: string;
          p_label_file_id: string;
          p_label_text: string;
          p_lot_number: string;
          p_pigment_id: string;
          p_request_id: string;
          p_version: number;
        };
        Returns: {
          active: boolean;
          created_at: string;
          expires_on: string;
          id: string;
          label_file_id: string;
          label_text: string;
          lot_number: string;
          pigment_id: string;
          tenant_id: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "pigment_lots";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_treatment_preparation: {
        Args: {
          p_anamnesis_version_id: string;
          p_answers: Json;
          p_appointment_id: string;
          p_appointment_version: number;
          p_consent_version_id: string;
          p_lot_ids: string[];
          p_request_id: string;
          p_version: number;
        };
        Returns: {
          anamnesis_version_id: string | null;
          appointment_id: string;
          appointment_version: number;
          client_id: string;
          consent_version_id: string;
          created_at: string;
          created_by: string;
          id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "treatment_preparations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_client_assignment: {
        Args: {
          p_assigned: boolean;
          p_client_id: string;
          p_operator_id: string;
          p_version: number;
        };
        Returns: {
          active: boolean;
          assigned_by: string;
          client_id: string;
          id: string;
          operator_id: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "client_assignments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_clinical_template_active: {
        Args: { p_active: boolean; p_id: string; p_version: number };
        Returns: {
          active: boolean;
          created_at: string;
          current_revision: number;
          current_version_id: string;
          id: string;
          kind: string;
          service_id: string | null;
          tenant_id: string;
          title: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "clinical_templates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_appointment: {
        Args: { p_data: Json; p_id: string; p_version: number };
        Returns: {
          client_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          location_id: string;
          operator_id: string;
          price_cents: number;
          schedule_revision: number;
          service_id: string;
          service_name: string;
          starts_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_client: {
        Args: { p_data: Json; p_id: string; p_version: number };
        Returns: {
          archived_at: string | null;
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          phone: string | null;
          search_name: string | null;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "clients";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_team_member: {
        Args: {
          p_active: boolean;
          p_clinical_access: boolean;
          p_id: string;
          p_version: number;
        };
        Returns: {
          active: boolean;
          clinical_access: boolean;
          created_at: string;
          display_name: string;
          id: string;
          role: string;
          tenant_id: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "users";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
