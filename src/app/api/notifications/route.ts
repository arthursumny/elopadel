import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { loadNotifications, markNotificationsRead } from '@/lib/db/notifications';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para ver suas notificações.' }, { status: 401 });
  return NextResponse.json(await loadNotifications(userId), { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para atualizar suas notificações.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const notificationId = typeof body.id === 'string' && body.id ? body.id : undefined;
  const updated = await markNotificationsRead(userId, notificationId);
  return NextResponse.json({ ok: true, updated });
}
