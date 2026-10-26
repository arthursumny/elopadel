import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentUserId, PLAYER_COOKIE_NAME } from '@/lib/auth';
import { loadCurrentPlayer, loadHistory } from '@/lib/db/queries';
import { db } from '@/lib/db';
import { devicePushTokens, oauthAccounts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    const player = await loadCurrentPlayer();
    if (!player || player.id === 'anonymous') {
      return NextResponse.json({ error: 'Jogador não encontrado.' }, { status: 404 });
    }

    const history = await loadHistory().catch(() => null);
    const total = history?.total ?? player.rating.matches;
    const wins = history?.wins ?? 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const fullProfile = {
      ...player,
      wins,
      totalMatches: total,
      winRate,
    };

    return NextResponse.json({
      ok: true,
      player: fullProfile,
      user: fullProfile,
      profile: fullProfile,
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Jogador não encontrado')) {
      return NextResponse.json({ error: 'Jogador não encontrado.' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Não foi possível carregar o perfil.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    if (db) {
      // 1. Remove push notification tokens
      await db.delete(devicePushTokens).where(eq(devicePushTokens.userId, userId)).catch(() => {});

      // 2. Remove OAuth account links
      await db.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId)).catch(() => {});

      // 3. Deactivate & anonymize user profile (preserving match record consistency for past games)
      await db.update(users).set({
        isActive: false,
        email: null,
        displayName: 'Jogador Desativado',
        handle: `@excluido_${userId.slice(0, 8)}`,
        updatedAt: new Date(),
      }).where(eq(users.id, userId)).catch(() => {});
    }

    try {
      const store = await cookies();
      store.delete(PLAYER_COOKIE_NAME);
    } catch {}

    return NextResponse.json({
      ok: true,
      message: 'Conta excluída com sucesso.',
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao excluir conta.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

