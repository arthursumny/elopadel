import { Dashboard } from '@/components/dashboard';
import { requireUserId } from '@/lib/auth';
import { loadActivities, loadCurrentPlayer, loadSeason } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  await requireUserId();
  const [player, activities, season] = await Promise.all([loadCurrentPlayer(), loadActivities(), loadSeason()]);
  return <Dashboard player={player} activities={activities} season={season} />;
}
