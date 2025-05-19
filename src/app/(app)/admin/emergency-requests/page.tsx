
import { EmergencyRequestManagementClientContent } from "@/components/admin/emergency-requests/EmergencyRequestManagementClientContent";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Manage Emergency Requests - Admin Panel | ${APP_NAME}`,
};

export default async function AdminEmergencyRequestsPage() {
  return <EmergencyRequestManagementClientContent />;
}
