
import { NotificationSenderClientContent } from "@/components/admin/notifications/NotificationSenderClientContent";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Send Notifications - Admin Panel | ${APP_NAME}`,
};

export default async function AdminNotificationsPage() {
  return <NotificationSenderClientContent />;
}
