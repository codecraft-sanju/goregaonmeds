import AdminPanel from './AdminPanel';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Billing studio | Goregaonmeds',
  robots: { index: false, follow: false },
};
export default function AdminPage() { return <AdminPanel />; }
