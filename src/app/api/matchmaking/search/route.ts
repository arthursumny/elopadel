import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { normalizeCourtSide, timeToMinutes } from '@/lib/domain/matchmaking';
import { cancelMatchSearch, createMatchSearch } from '@/lib/db/matchmaking';
import { db } from '@/lib/db';
import { loadActiveMatchSearch, loadPendingMatchSearchInvitations } from '@/lib/db/queries';
import { isActiveClubAtLocation, isGeoapifyConfigured, resolveFriendlyLocation, verifyLocationToken } from '@/lib/location';
import type { CanonicalLocation } from '@/lib/location-domain';
import type { CourtSide } from '@/lib/types';

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para consultar sua busca.' }, { status: 401 });
  return NextResponse.json({ search: await loadActiveMatchSearch(userId) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para buscar uma partida.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'O corpo da busca é inválido.' }, { status: 400 });
  const partyType = body.partyType === 'duo' ? 'duo' : 'solo';
  const mode = body.mode === 'friendly' ? 'friendly' : 'ranked';
  if (!db) return NextResponse.json({ error: 'O banco de dados não está configurado.' }, { status: 503 });
  const dates: string[] = Array.isArray(body.dates) ? Array.from(new Set<string>(body.dates.filter((value: unknown): value is string => isDateString(value)))).sort() : [];
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const selectedCity = typeof body.city === 'string' ? body.city.trim() : '';
  const partnerId = partyType === 'duo' && typeof body.partnerId === 'string' ? body.partnerId : undefined;
  const clubId = typeof body.clubId === 'string' && body.clubId ? body.clubId : undefined;
  if (body.clubId !== undefined && body.clubId !== null && body.clubId !== '' && (typeof body.clubId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clubId))) return NextResponse.json({ error: 'O clube selecionado é inválido.' }, { status: 400 });
  const timezoneOffset = typeof body.timezoneOffset === 'number' && Number.isFinite(body.timezoneOffset) && Math.abs(body.timezoneOffset) <= 840 ? body.timezoneOffset : 180;
  const sidePreference: CourtSide = normalizeCourtSide(body.sidePreference);
  const fromMinutes = timeToMinutes(from);
  const toMinutes = timeToMinutes(to);
  if (dates.length === 0) return NextResponse.json({ error: 'Selecione pelo menos um dia em que você pode jogar.' }, { status: 400 });
  if (fromMinutes === null || toMinutes === null || fromMinutes > toMinutes) return NextResponse.json({ error: 'Informe uma janela de horário válida.' }, { status: 400 });
  if (dates.some((date) => new Date(`${date}T23:59:59`).getTime() <= Date.now())) return NextResponse.json({ error: 'Escolha apenas dias futuros.' }, { status: 400 });
  if (partyType === 'duo' && !partnerId) return NextResponse.json({ error: 'Escolha o parceiro da dupla.' }, { status: 400 });
  if (partnerId === userId) return NextResponse.json({ error: 'Escolha um parceiro diferente de você.' }, { status: 400 });
  let location: CanonicalLocation | null;
  if (mode === 'ranked') {
    if (!isGeoapifyConfigured()) return NextResponse.json({ error: 'A validação de localização está temporariamente indisponível.' }, { status: 503 });
    if (typeof body.locationToken !== 'string' || !body.locationToken) return NextResponse.json({ error: 'Valide sua localização antes de iniciar uma busca ranqueada.' }, { status: 422 });
    location = await verifyLocationToken(body.locationToken, userId);
    if (!location) return NextResponse.json({ error: 'A validação de localização expirou ou é inválida. Valide sua localização novamente.' }, { status: 422 });
    if (!(await isActiveClubAtLocation(location, clubId))) return NextResponse.json({ error: 'A cidade ou clube escolhido não está mais disponível para partidas.' }, { status: 400 });
  } else {
    if (!selectedCity) return NextResponse.json({ error: 'Informe a cidade onde você quer jogar.' }, { status: 400 });
    location = await resolveFriendlyLocation(selectedCity, clubId);
    if (!location) return NextResponse.json({ error: 'A cidade ou clube selecionado não corresponde a uma localidade ativa.' }, { status: 400 });
  }

  const result = await createMatchSearch({ userId, partnerId, partyType, mode, dates, from, to, city: location.city, state: location.state, country: location.country, clubId, timezoneOffset, sidePreference, replace: body.replace === true });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.error?.includes('banco') ? 503 : 409 });
  if ('invited' in result && result.invited) return NextResponse.json({ ok: true, invited: true, invitation: (await loadPendingMatchSearchInvitations(userId)).find((invitation) => invitation.id === result.searchId) ?? null, message: 'Convite enviado. A busca começa quando seu parceiro aceitar.' }, { status: 201 });
  if (result.matched) return NextResponse.json({ ok: true, matched: true, matchId: result.matchId, message: 'Partida encontrada. Confirme que você vai jogar.' }, { status: 201 });
  return NextResponse.json({ ok: true, matched: false, search: await loadActiveMatchSearch(userId), message: 'Você entrou no saguão de busca. Avisaremos quando encontrarmos jogadores compatíveis.' }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para cancelar sua busca.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'O corpo do cancelamento é inválido.' }, { status: 400 });
  await cancelMatchSearch(userId, typeof body.searchId === 'string' ? body.searchId : undefined);
  return NextResponse.json({ ok: true, message: 'Busca cancelada.' });
}
