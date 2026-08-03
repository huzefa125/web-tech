import { RequireAuth } from '@/components/require-auth';
import { SiteHeader } from '@/components/site-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SiteHeader />
      <div className="flex-1">{children}</div>
    </RequireAuth>
  );
}
