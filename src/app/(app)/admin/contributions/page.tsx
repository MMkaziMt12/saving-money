
import { ContributionManagementClientContent } from "@/components/admin/contributions/ContributionManagementClientContent";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `Manage Contributions - Admin Panel | ${APP_NAME}`,
};

export default async function AdminContributionsPage() {
  // This page is a Server Component.
  // It's wrapped by AdminLayout which handles auth and admin checks.
  // The client component will handle its own data fetching.
  return <ContributionManagementClientContent />;
}
