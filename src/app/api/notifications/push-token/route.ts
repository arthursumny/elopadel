import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import {
  deactivateDevicePushToken,
  upsertDevicePushToken,
  type PushPlatform,
} from '@/lib/notifications/tokens';

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: 'Não autorizado. Faça login para registrar seu dispositivo.' },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 }
    );
  }

  const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
  if (!rawToken || rawToken.length > 500) {
    return NextResponse.json(
      { error: 'Token de push é obrigatório.' },
      { status: 400 }
    );
  }

  const rawPlatform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
  if (rawPlatform !== 'ios' && rawPlatform !== 'android' && rawPlatform !== 'web') {
    return NextResponse.json(
      { error: 'Plataforma inválida. Utilize ios, android ou web.' },
      { status: 400 }
    );
  }
  const platform = rawPlatform as PushPlatform;

  const deviceType =
    typeof body.deviceType === 'string' && body.deviceType.trim()
      ? body.deviceType.trim().slice(0, 100)
      : undefined;

  const appVersion =
    typeof body.appVersion === 'string' && body.appVersion.trim()
      ? body.appVersion.trim().slice(0, 50)
      : undefined;

  try {
    const record = await upsertDevicePushToken({
      userId,
      token: rawToken,
      platform,
      deviceType,
      appVersion,
    });

    return NextResponse.json(
      {
        ok: true,
        registeredAt: record.lastSeenAt.toISOString(),
        token: record.token,
        platform: record.platform,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao registrar push token:', error);
    return NextResponse.json(
      { error: 'Não foi possível registrar o token de notificações.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: 'Não autorizado. Faça login para gerenciar seu dispositivo.' },
      { status: 401 }
    );
  }

  let token: string | null = null;

  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken.trim()) {
      token = queryToken.trim();
    }
  } catch {
    // URL parsing failed or relative URL in tests
  }

  if (!token) {
    const body = await request.json().catch(() => null);
    if (body && typeof body.token === 'string' && body.token.trim()) {
      token = body.token.trim();
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: 'Token de push é obrigatório.' },
      { status: 400 }
    );
  }

  try {
    const unregistered = await deactivateDevicePushToken(userId, token);
    return NextResponse.json(
      {
        ok: true,
        deactivated: unregistered,
        unregistered,
        token,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao desativar push token:', error);
    return NextResponse.json(
      { error: 'Não foi possível desativar o token de notificações.' },
      { status: 500 }
    );
  }
}
