import { ClubDashboardView } from '@/components/club-dashboard-view';
import { requireClubId } from '@/lib/auth';
import { loadClubDashboard } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function ClubPage() {
  const clubId = await requireClubId();
  const dashboard = await loadClubDashboard(clubId);
  return <ClubDashboardView club={dashboard.club} initialMemberships={dashboard.pendingMemberships.map((membership) => ({ ...membership, createdAt: membership.createdAt.toISOString() }))} initialDisputedMatches={dashboard.disputedMatches} initialAttendanceMatches={dashboard.attendanceMatches} />;
}
