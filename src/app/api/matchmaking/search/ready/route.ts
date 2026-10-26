import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { normalizeCourtSide } from '@/lib/domain/matchmaking';
import { setMatchSearchReady } from '@/lib/db/matchmaking';
import { db } from '@/lib/db';
import { loadActiveMatchSearch } from '@/lib/db/queries';
import { matchSearches } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { areCanonicalLocationsEqual } from '@/lib/location-domain';
import { isActiveClubAtLocation, isGeoapifyConfigured, verifyLocationToken } from '@/lib/location';

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para confirmar a busca.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados não está configurado.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'O corpo da confirmação é inválido.' }, { status: 400 });
  if (typeof body.searchId !== 'string' || !body.searchId) return NextResponse.json({ error: 'Busca inválida.' }, { status: 400 });
  const ready = body.ready !== false;
  let verifiedLocation;
  if (ready) {
    const [search] = await db.select({ id: matchSearches.id, mode: matchSearches.mode, city: matchSearches.city, state: matchSearches.state, country: matchSearches.country, clubId: matchSearches.clubId })
      .from(matchSearches)
      .where(and(eq(matchSearches.id, body.searchId), eq(matchSearches.status, 'lobby'), or(eq(matchSearches.userId, userId), eq(matchSearches.partnerId, userId))))
      .limit(1);
    if (!search) return NextResponse.json({ error: 'Este saguão não está mais disponível.' }, { status: 409 });
    if (search.mode !== 'friendly') {
      if (!isGeoapifyConfigured()) return NextResponse.json({ error: 'A validação de localização está temporariamente indisponível.' }, { status: 503 });
      if (typeof body.locationToken !== 'string' || !body.locationToken) return NextResponse.json({ error: 'Valide sua localização antes de confirmar a busca ranqueada.' }, { status: 422 });
      verifiedLocation = await verifyLocationToken(body.locationToken, userId);
      const searchLocation = search.state && search.country ? { city: search.city, state: search.state, country: search.country } : null;
      if (!verifiedLocation || !areCanonicalLocationsEqual(verifiedLocation, searchLocation)) return NextResponse.json({ error: 'A localização validada precisa corresponder à cidade da busca.' }, { status: 422 });
      if (!(await isActiveClubAtLocation(verifiedLocation, search.clubId ?? undefined))) return NextResponse.json({ error: 'A cidade ou clube escolhido não está mais disponível para partidas.' }, { status: 409 });
    }
  }
  const result = await setMatchSearchReady(body.searchId, userId, ready, normalizeCourtSide(body.sidePreference), verifiedLocation);
  if (!result) return NextResponse.json({ error: 'Este saguão não está mais disponível.' }, { status: 409 });
  if ('blocked' in result) {
    const error = result.blocked === 'location'
      ? 'Os dois integrantes da dupla precisam validar a cidade da busca.'
      : result.blocked === 'location-expired'
        ? 'A validação de localização expirou. Confirme novamente sua presença no saguão.'
        : 'Os lados escolhidos não formam uma dupla válida ou o ranking dos jogadores deixou de ser compatível.';
    return NextResponse.json({ error }, { status: 409 });
  }
  if (result.matched && result.matchId) return NextResponse.json({ ok: true, matched: true, matchId: result.matchId, search: await loadActiveMatchSearch(userId), message: 'Partida encontrada. Confirme que você vai jogar.' });
  return NextResponse.json({ ok: true, started: result.started, search: await loadActiveMatchSearch(userId), message: result.started ? 'Os dois confirmaram. A busca foi iniciada.' : 'Sua confirmação foi registrada. Aguardando seu parceiro.' });
}
