export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_invitations: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          practitioner_id: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          practitioner_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          practitioner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      appointment_requests: {
        Row: {
          created_at: string
          duration: string | null
          id: string
          patient_id: string
          preferred_timing: string | null
          raw_notes: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_note: string | null
          status: string
          suggested_specialty: string | null
          summary: string
          symptoms: string[]
          urgency: string
        }
        Insert: {
          created_at?: string
          duration?: string | null
          id?: string
          patient_id?: string
          preferred_timing?: string | null
          raw_notes: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_note?: string | null
          status?: string
          suggested_specialty?: string | null
          summary: string
          symptoms?: string[]
          urgency: string
        }
        Update: {
          created_at?: string
          duration?: string | null
          id?: string
          patient_id?: string
          preferred_timing?: string | null
          raw_notes?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_note?: string | null
          status?: string
          suggested_specialty?: string | null
          summary?: string
          symptoms?: string[]
          urgency?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          patient_id: string
          practitioner_id: string
          reason: string | null
          slot_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          patient_id: string
          practitioner_id: string
          reason?: string | null
          slot_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          patient_id?: string
          practitioner_id?: string
          reason?: string | null
          slot_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          severity: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          severity?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          severity?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      availability_slots: {
        Row: {
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          is_booked: boolean
          practitioner_id: string
          starts_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_booked?: boolean
          practitioner_id: string
          starts_at: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_booked?: boolean
          practitioner_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string
        }
        Relationships: []
      }
      consultation_reports: {
        Row: {
          appointment_id: string | null
          created_at: string
          diagnosis: string
          id: string
          observations: string
          patient_id: string
          practitioner_id: string
          prescription: string
          reason: string
          recommendations: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
          validated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          diagnosis?: string
          id?: string
          observations?: string
          patient_id: string
          practitioner_id: string
          prescription?: string
          reason: string
          recommendations?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          validated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          diagnosis?: string
          id?: string
          observations?: string
          patient_id?: string
          practitioner_id?: string
          prescription?: string
          reason?: string
          recommendations?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_reports_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      medical_records: {
        Row: {
          allergies: string | null
          blood_type: string | null
          chronic_conditions: string | null
          current_treatments: string | null
          id: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          current_treatments?: string | null
          id?: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          current_treatments?: string | null
          id?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_results: {
        Row: {
          category: string
          clinic_id: string | null
          created_at: string
          id: string
          patient_id: string
          practitioner_id: string | null
          result_date: string
          status: Database["public"]["Enums"]["result_status"]
          summary: string
          title: string
          values_json: Json | null
        }
        Insert: {
          category: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          patient_id: string
          practitioner_id?: string | null
          result_date?: string
          status?: Database["public"]["Enums"]["result_status"]
          summary: string
          title: string
          values_json?: Json | null
        }
        Update: {
          category?: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          practitioner_id?: string | null
          result_date?: string
          status?: Database["public"]["Enums"]["result_status"]
          summary?: string
          title?: string
          values_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_results_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_results_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      practitioner_clinics: {
        Row: {
          clinic_id: string
          practitioner_id: string
        }
        Insert: {
          clinic_id: string
          practitioner_id: string
        }
        Update: {
          clinic_id?: string
          practitioner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_clinics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_clinics_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioners: {
        Row: {
          created_at: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          specialty_id: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          specialty_id: string
          title?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          specialty_id?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioners_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name?: string
          id: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      specialties: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_active: {
        Args: { _active: boolean; _user: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      book_appointment: {
        Args: { _reason: string; _slot_id: string }
        Returns: string
      }
      cancel_appointment: { Args: { _id: string }; Returns: undefined }
      complete_appointment: {
        Args: {
          _id: string
          _status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: undefined
      }
      current_practitioner_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_aal2: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_my_patient: { Args: { _patient: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      notify: {
        Args: { _message: string; _title: string; _type: string; _user: string }
        Returns: undefined
      }
      reschedule_appointment: {
        Args: { _id: string; _new_slot: string }
        Returns: string
      }
      validate_report: { Args: { _id: string }; Returns: undefined }
      validate_result: { Args: { _id: string }; Returns: undefined }
      write_audit: {
        Args: {
          _action: string
          _details: Json
          _entity: string
          _entity_id: string
          _ip?: string
          _severity?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "patient" | "practitioner" | "admin" | "staff"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      report_status: "draft" | "validated"
      result_status: "pending" | "validated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["patient", "practitioner", "admin", "staff"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      report_status: ["draft", "validated"],
      result_status: ["pending", "validated"],
    },
  },
} as const
