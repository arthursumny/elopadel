import { MatchmakingView } from '@/components/matchmaking-view';
import { requireUserId } from '@/lib/auth';
import { loadActiveMatchSearch, loadClubs, loadCurrentPlayer, loadFriends, loadPendingMatchChallenges, loadPendingMatchSearchInvitations } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function MatchmakingPage() {
  const userId = await requireUserId();
  const [clubs, player, friends, activeSearch, searchInvitations, challenges] = await Promise.all([loadClubs(), loadCurrentPlayer(), loadFriends(userId), loadActiveMatchSearch(userId), loadPendingMatchSearchInvitations(userId), loadPendingMatchChallenges(userId)]);
  return <MatchmakingView clubs={clubs} players={friends} searchInvitations={searchInvitations} challenges={challenges} activeSearch={activeSearch} playerName={player.displayName} playerInitials={player.initials} playerCity={player.city} />;
}
