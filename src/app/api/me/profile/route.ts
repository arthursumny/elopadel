import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { loadProfileEdit, ProfileEditError, saveProfileEdit } from '@/lib/profile-edit';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function errorResponse(error: unknown) {
  if (error instanceof ProfileEditError) {
    if (error.code === 'NOT_FOUND') return response({ error: 'Perfil não encontrado.' }, 404);
    return response({ error: error.code === 'INVALID_CLUB' ? 'Clube inválido para esta localidade.' : 'Localidade indisponível.' }, 400);
  }
  return response({ error: 'Banco de dados indisponível.' }, 503);
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return response({ error: 'Faça login para editar o perfil.' }, 401);
  if (!db) return response({ error: 'Banco de dados indisponível.' }, 503);
  try {
    return response({ ok: true, profile: await loadProfileEdit(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return response({ error: 'Faça login para editar o perfil.' }, 401);
  if (!db) return response({ error: 'Banco de dados indisponível.' }, 503);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: 'JSON inválido.' }, 400); }
  if (!body || typeof body !== 'object') return response({ error: 'Dados inválidos.' }, 400);
  const value = body as Record<string, unknown>;
  if (typeof value.city !== 'string' || typeof value.state !== 'string' || typeof value.country !== 'string' || !(typeof value.clubId === 'string' || value.clubId === null)) {
    return response({ error: 'Dados inválidos.' }, 400);
  }
  if (typeof value.clubId === 'string' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.clubId)) return response({ error: 'Clube inválido.' }, 400);
  try {
    return response({ ok: true, profile: await saveProfileEdit(userId, { city: value.city, state: value.state, country: value.country, clubId: value.clubId }) });
  } catch (error) {
    return errorResponse(error);
  }
}
