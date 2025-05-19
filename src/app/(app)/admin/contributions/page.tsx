
import { ContributionManagementClientContent } from "@/components/admin/contributions/ContributionManagementClientContent";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Manage Contributions - Admin Panel | ${APP_NAME}`,
};

export default async function AdminContributionsPage() {
  return <ContributionManagementClientContent />;
}
