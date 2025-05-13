
export type UserRole = "admin" | "user";

export interface Profile {
  id: string; // maps to auth.users.id
  full_name: string;
  phone: string;
  email: string;
  role: UserRole;
  is_approved: boolean;
  joined_at: string; // ISO date string
  avatar_url?: string; 
}

export interface MonthlyContribution {
  id: string;
  user_id: string;
  user_name?: string; // For display purposes in admin views
  amount: number;
  payment_date: string; // ISO date string
  month: number; // 1-12
  year: number;
  recorded_by_admin_id?: string; // if admin added it
  recorded_by_admin_name?: string; // For display
}

export interface EmergencyRequest {
  id: string;
  user_id: string;
  user_name?: string; // For display
  amount_requested: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string; // ISO date string
  reviewed_by_admin_id?: string;
  reviewed_by_admin_name?: string; // For display
  reviewed_at?: string; // ISO date string
}

export interface Notification {
  id: string;
  user_id: string; 
  message: string;
  type: "contribution_reminder" | "emergency_update" | "approval_status" | "general";
  sent_at: string; // ISO date string
  channel: "email" | "whatsapp" | "app"; 
}

// Mock authenticated user type
export interface AuthenticatedUser extends Profile {}
