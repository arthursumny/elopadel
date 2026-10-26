import { loadCurrentPlayer } from '@/lib/db/queries';
import { ProfileView } from '@/components/profile-view';
import { requireUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  await requireUserId();
  return <ProfileView player={await loadCurrentPlayer()} />;
}
