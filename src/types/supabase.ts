//
// TODO: Replace this file with your Supabase generated types.
//
// This is a temporary placeholder. You should generate your Supabase types using:
//   supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts
//
// See: https://supabase.com/docs/guides/database/api/generating-types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string | null // Added created_at
          updated_at: string | null
          full_name: string | null
          email: string | null // email might be redundant if auth.users.email is primary source
          phone: string | null
          avatar_url: string | null
          role: "user" | "admin"
          is_approved: boolean
          is_active: boolean // Added is_active
          joined_at: string | null
          last_login: string | null // Added last_login
        }
        Insert: {
          id: string
          created_at?: string | null
          updated_at?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: "user" | "admin"
          is_approved?: boolean
          is_active?: boolean
          joined_at?: string | null
          last_login?: string | null
        }
        Update: {
          id?: string
          created_at?: string | null
          updated_at?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: "user" | "admin"
          is_approved?: boolean
          is_active?: boolean
          joined_at?: string | null
          last_login?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      monthly_contributions: {
        Row: {
          id: string
          user_id: string
          amount: number
          payment_date: string
          month: number
          year: number
          recorded_by_admin_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number // Made non-nullable
          payment_date: string // Made non-nullable
          month: number // Made non-nullable
          year: number // Made non-nullable
          recorded_by_admin_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          payment_date?: string
          month?: number
          year?: number
          recorded_by_admin_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_contributions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_contributions_recorded_by_admin_id_fkey"
            columns: ["recorded_by_admin_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      emergency_requests: {
        Row: {
          id: string
          user_id: string
          amount_requested: number
          reason: string
          status: "pending" | "approved" | "rejected"
          requested_at: string
          reviewed_by_admin_id: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
          admin_notes: string | null // Added admin_notes
        }
        Insert: {
          id?: string
          user_id: string
          amount_requested: number // Made non-nullable
          reason: string // Made non-nullable
          status?: "pending" | "approved" | "rejected"
          requested_at?: string
          reviewed_by_admin_id?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          admin_notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          amount_requested?: number
          reason?: string
          status?: "pending" | "approved" | "rejected"
          requested_at?: string
          reviewed_by_admin_id?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          admin_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_requests_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_requests_reviewed_by_admin_id_fkey"
            columns: ["reviewed_by_admin_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: { // Added notifications table definition
        Row: {
          id: string
          user_id: string
          message: string | null
          type: string | null
          sent_at: string
          channel: string | null
        }
        Insert: {
          id?: string
          user_id: string
          message?: string | null
          type?: string | null
          sent_at?: string
          channel?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          message?: string | null
          type?: string | null
          sent_at?: string
          channel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      handle_new_user: { // Placeholder for the function, actual SQL needed in Supabase
        Args: Record<string, unknown> 
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
