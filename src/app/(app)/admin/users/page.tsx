
import { UserManagementClientContent } from "@/components/admin/users/UserManagementClientContent";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Manage Users - Admin Panel | ${APP_NAME}`,
};

export default async function AdminUsersPage() {
  // This page is a Server Component.
  // It's wrapped by AdminLayout which handles auth and admin checks.
  // The client component will handle its own data fetching.
  return <UserManagementClientContent />;
}
