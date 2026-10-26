import { FriendsView } from '@/components/friends-view';
import { requireUserId } from '@/lib/auth';
import { loadCurrentPlayer, loadFriends, loadPendingFriendRequests } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  const userId = await requireUserId();
  const [player, friends, requests] = await Promise.all([loadCurrentPlayer(), loadFriends(userId), loadPendingFriendRequests(userId)]);
  return <FriendsView initialFriends={friends} initialRequests={requests} playerName={player.displayName} playerInitials={player.initials} playerHandle={player.handle} />;
}
