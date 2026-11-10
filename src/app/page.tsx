import { Dashboard } from '@/components/dashboard';
import { LandingPage } from '@/components/landing-page';
import { currentUserId, requireUserId } from '@/lib/auth';
import { loadActivities, loadCurrentPlayer, loadSeason } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const userId = await currentUserId();
  if (!userId) {
    return <LandingPage />;
  }
  await requireUserId();
  const [player, activities, season] = await Promise.all([loadCurrentPlayer(), loadActivities(), loadSeason()]);
  return <Dashboard player={player} activities={activities} season={season} />;
}
