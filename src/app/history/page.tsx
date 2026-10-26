import { HistoryView } from '@/components/history-view';
import { requireUserId } from '@/lib/auth';
import { loadCurrentPlayer, loadHistory } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  await requireUserId();
  const [player, history] = await Promise.all([loadCurrentPlayer(), loadHistory()]);
  return <HistoryView history={history} playerName={player.displayName} playerInitials={player.initials} />;
}
