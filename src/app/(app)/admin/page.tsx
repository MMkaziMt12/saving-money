
import { redirect } from 'next/navigation';

export default function AdminPage() {
  // Redirect to the default admin section, e.g., user management
  redirect('/admin/users');
  // This page content will not be rendered due to the redirect
  return null;
}
