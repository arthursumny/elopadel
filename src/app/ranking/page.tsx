import { AppShell } from '@/components/app-shell';
import { LeaderboardView } from '@/components/leaderboard-view';
import { requireUserId } from '@/lib/auth';
import { loadCurrentPlayer, loadLeaderboard } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function RankingPage() {
  await requireUserId();
  const [entries, player] = await Promise.all([loadLeaderboard(), loadCurrentPlayer()]);
  return <AppShell playerName={player.displayName} playerInitials={player.initials}><LeaderboardView entries={entries} player={player} /></AppShell>;
}
