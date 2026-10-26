import { generateSessionToken, generateOnboardingToken, verifyToken, createMockGoogleIdToken, createMockAppleIdentityToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS, PlayerFixture } from '../fixtures/players';
import { isValidPublicHandle, normalizeHandleInput, normalizePublicHandle } from '@/lib/handles';
import { initialRankForCategory, ratingMidpointForRank } from '@/lib/ranks';
import { canValidateResult, hasConflictingResult, validateBestOfThree } from '@/lib/domain/match';
import { areCompetitivePlayersCompatible, areTeamSidesCompatible } from '@/lib/domain/matchmaking';
import { applyRankPenalty, noShowPenalty } from '@/lib/domain/attendance';
import { calculateRatingUpdate, teamRating } from '@/lib/domain/rating';
import { pushService } from './push-service';

export interface ClientSession {
  token?: string;
  cookie?: string;
  userId?: string;
}

export class OpaqueBoxClient {
  private mode: 'mobile' | 'web';
  private token?: string;
  private cookie?: string;
  private currentUserId?: string;

  // In-memory isolated state store representing platform database state
  private playersState: Map<string, PlayerFixture> = new Map();
  private authAccounts: Map<string, { userId: string; provider: string; providerAccountId: string; email: string }> = new Map();
  private matchSearches: Map<string, any> = new Map();
  private matchesState: Map<string, any> = new Map();
  private friendsState: Map<string, { id: string; requesterId: string; addresseeId: string; status: 'pending' | 'accepted' | 'declined' }> = new Map();

  constructor(mode: 'mobile' | 'web' = 'mobile') {
    this.mode = mode;
    this.resetState();
  }

  resetState() {
    this.playersState.clear();
    this.authAccounts.clear();
    this.matchSearches.clear();
    this.matchesState.clear();
    this.friendsState.clear();
    pushService.clear();

    // Populate base fixture players
    for (const [key, player] of Object.entries(FIXTURE_PLAYERS)) {
      this.playersState.set(player.id, { ...player });
      // Default link for test players
      this.authAccounts.set(`google:${player.id}`, {
        userId: player.id,
        provider: 'google',
        providerAccountId: `google-sub-${player.id}`,
        email: player.email,
      });
    }
  }

  asMobile(token?: string) {
    this.mode = 'mobile';
    this.token = token;
    return this;
  }

  asWeb(cookie?: string) {
    this.mode = 'web';
    this.cookie = cookie;
    return this;
  }

  setAuthenticatedUser(userId: string, token: string) {
    this.currentUserId = userId;
    if (this.mode === 'mobile') {
      this.token = token;
    } else {
      this.cookie = token;
    }
  }

  async resolveCurrentUserId(): Promise<string | null> {
    const rawToken = this.mode === 'mobile' ? this.token : this.cookie;
    if (!rawToken) return null;

    try {
      const { payload } = await verifyToken(rawToken);
      if (payload.sub && typeof payload.sub === 'string') {
        return payload.sub;
      }
    } catch {
      return null;
    }
    return null;
  }

  // --- R2: Social Auth & Onboarding & Account Linking ---

  async socialAuth(body: {
    provider: 'google' | 'apple';
    idToken: string;
    rawFullName?: { firstName?: string; lastName?: string };
  }): Promise<{
    ok: boolean;
    status: 'authenticated' | 'needs_onboarding';
    token?: string;
    onboardingToken?: string;
    player?: PlayerFixture;
    profile?: { email: string; suggestedName?: string };
    error?: string;
  }> {
    if (!body.idToken || body.idToken.trim() === '') {
      return { ok: false, status: 'needs_onboarding', error: 'Missing token' };
    }

    // Decode synthetic token payload
    const parts = body.idToken.split('.');
    if (parts.length < 2) {
      return { ok: false, status: 'needs_onboarding', error: 'Malformed token' };
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return { ok: false, status: 'needs_onboarding', error: 'Invalid token encoding' };
    }

    const { sub, email, email_verified, name } = payload;
    const accountKey = `${body.provider}:${sub}`;

    // 1. Direct provider match
    const existingAccount = this.authAccounts.get(accountKey);
    if (existingAccount) {
      const player = this.playersState.get(existingAccount.userId);
      if (player) {
        const token = await generateSessionToken(player.id);
        this.setAuthenticatedUser(player.id, token);
        return { ok: true, status: 'authenticated', token, player };
      }
    }

    // 2. Email matching existing user (auto-link by verified email)
    if (email) {
      for (const player of this.playersState.values()) {
        if (player.email.toLowerCase() === email.toLowerCase()) {
          this.authAccounts.set(accountKey, {
            userId: player.id,
            provider: body.provider,
            providerAccountId: sub,
            email,
          });
          const token = await generateSessionToken(player.id);
          this.setAuthenticatedUser(player.id, token);
          return { ok: true, status: 'authenticated', token, player };
        }
      }
    }

    // 3. New user requiring onboarding
    const onboardingToken = await generateOnboardingToken(
      body.provider,
      sub,
      email ?? 'social_user@example.com',
      name ?? body.rawFullName?.firstName
    );

    return {
      ok: true,
      status: 'needs_onboarding',
      onboardingToken,
      profile: {
        email: email ?? 'social_user@example.com',
        suggestedName: name ?? body.rawFullName?.firstName,
      },
    };
  }

  async completeOnboarding(body: {
    onboardingToken: string;
    displayName: string;
    handle: string;
    city: string;
    state: string;
    category: string;
    clubId?: string;
  }): Promise<{
    ok: boolean;
    status?: 'authenticated';
    token?: string;
    player?: PlayerFixture;
    error?: string;
    code?: number;
  }> {
    let tokenPayload: any;
    try {
      const { payload } = await verifyToken(body.onboardingToken);
      tokenPayload = payload;
    } catch {
      return { ok: false, error: 'Invalid or expired onboarding token', code: 401 };
    }

    const cleanHandle = body.handle.trim().replace(/^@/, '');
    if (cleanHandle.length > 20 || cleanHandle.length < 3) {
      return { ok: false, error: 'Handle length must be between 3 and 20 characters', code: 400 };
    }

    const normalizedHandle = normalizePublicHandle(body.handle);
    if (!isValidPublicHandle(normalizedHandle)) {
      return { ok: false, error: 'Invalid handle format', code: 400 };
    }

    // Check unique handle
    for (const player of this.playersState.values()) {
      if (player.handle.toLowerCase() === normalizedHandle.toLowerCase()) {
        return { ok: false, error: 'Handle already taken', code: 409 };
      }
    }

    const initialRank = initialRankForCategory(body.category);
    const initialRating = ratingMidpointForRank(initialRank);

    const newUserId = `user-${Math.random().toString(36).substring(2, 10)}`;
    const newPlayer: PlayerFixture = {
      id: newUserId,
      displayName: body.displayName.trim(),
      handle: normalizedHandle,
      email: tokenPayload.email,
      city: body.city.trim(),
      state: body.state.toUpperCase().trim(),
      country: 'Brasil',
      category: body.category,
      tier: initialRank.label,
      points: 50,
      rating: initialRating,
      deviation: 350,
      matches: 0,
      provisionalMatches: 0,
      clubId: body.clubId,
    };

    this.playersState.set(newUserId, newPlayer);
    this.authAccounts.set(`${tokenPayload.provider}:${tokenPayload.sub}`, {
      userId: newUserId,
      provider: tokenPayload.provider,
      providerAccountId: tokenPayload.sub,
      email: tokenPayload.email,
    });

    const token = await generateSessionToken(newUserId);
    this.setAuthenticatedUser(newUserId, token);

    return {
      ok: true,
      status: 'authenticated',
      token,
      player: newPlayer,
    };
  }

  async linkExistingAccount(body: {
    onboardingToken: string;
    phone: string;
    otpCode: string;
  }): Promise<{
    ok: boolean;
    token?: string;
    player?: PlayerFixture;
    error?: string;
    code?: number;
  }> {
    let tokenPayload: any;
    try {
      const { payload } = await verifyToken(body.onboardingToken);
      tokenPayload = payload;
    } catch {
      return { ok: false, error: 'Invalid onboarding token', code: 401 };
    }

    if (body.otpCode !== '123456') {
      return { ok: false, error: 'Invalid OTP code', code: 400 };
    }

    // Find user by phone
    let existingPlayer: PlayerFixture | undefined;
    for (const p of this.playersState.values()) {
      if (p.phone === body.phone) {
        existingPlayer = p;
        break;
      }
    }

    if (!existingPlayer) {
      return { ok: false, error: 'User with phone not found', code: 404 };
    }

    // Link provider account to existing player
    this.authAccounts.set(`${tokenPayload.provider}:${tokenPayload.sub}`, {
      userId: existingPlayer.id,
      provider: tokenPayload.provider,
      providerAccountId: tokenPayload.sub,
      email: tokenPayload.email,
    });

    // Update email if not set
    if (!existingPlayer.email) {
      existingPlayer.email = tokenPayload.email;
      this.playersState.set(existingPlayer.id, existingPlayer);
    }

    const token = await generateSessionToken(existingPlayer.id);
    this.setAuthenticatedUser(existingPlayer.id, token);

    return { ok: true, token, player: existingPlayer };
  }

  // --- R1: Mobile Read Parity APIs ---

  async getMe(): Promise<{ ok: boolean; player?: PlayerFixture; error?: string; status?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      return { ok: false, error: 'Unauthorized', status: 401 };
    }

    const player = this.playersState.get(userId);
    if (!player) {
      return { ok: false, error: 'Player not found', status: 404 };
    }

    return { ok: true, player };
  }

  async getHistory(): Promise<{ ok: boolean; history: any[]; error?: string; status?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      return { ok: false, history: [], error: 'Unauthorized', status: 401 };
    }

    const userMatches: any[] = [];
    for (const match of this.matchesState.values()) {
      const isParticipant =
        match.teamA.player1Id === userId ||
        match.teamA.player2Id === userId ||
        match.teamB.player1Id === userId ||
        match.teamB.player2Id === userId;
      if (isParticipant) {
        userMatches.push(match);
      }
    }

    return { ok: true, history: userMatches };
  }

  async getSeason(): Promise<{ ok: boolean; season: any; error?: string; status?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      return { ok: false, season: null, error: 'Unauthorized', status: 401 };
    }

    const player = this.playersState.get(userId);
    return {
      ok: true,
      season: {
        id: 'season-2026-s1',
        name: 'Temporada Oficial 2026.1',
        status: 'active',
        daysRemaining: 45,
        userStats: {
          points: player?.points ?? 50,
          matches: player?.matches ?? 0,
          wins: Math.floor((player?.matches ?? 0) * 0.6),
          tier: player?.tier ?? '6ª III',
        },
      },
    };
  }

  // --- R3: Push Token Registration & Management ---

  async registerPushToken(body: {
    token: string;
    platform: 'ios' | 'android' | 'web';
    deviceType?: string;
    appVersion?: string;
  }): Promise<{ ok: boolean; registeredAt?: string; error?: string; status?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      return { ok: false, error: 'Unauthorized', status: 401 };
    }

    if (!body.token || typeof body.token !== 'string' || body.token.trim() === '') {
      return { ok: false, error: 'Invalid push token', status: 400 };
    }

    const res = pushService.registerDeviceToken(userId, body.token, body.platform);
    return { ok: true, registeredAt: res.registeredAt };
  }

  async unregisterPushToken(token: string): Promise<{ ok: boolean; error?: string }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) {
      return { ok: false, error: 'Unauthorized' };
    }

    return pushService.unregisterDeviceToken(userId, token);
  }

  // --- R1: Matchmaking, Match Room, Quorum & Scoring ---

  async createMatchSearch(params: {
    partyType: 'solo' | 'duo';
    partnerId?: string;
    mode: 'ranked' | 'friendly';
    dates: string[];
    from: string;
    to: string;
    city: string;
    clubId?: string;
    sidePreference?: 'left' | 'right' | 'any';
    partnerSidePreference?: 'left' | 'right' | 'any';
  }): Promise<{ ok: boolean; searchId?: string; error?: string; code?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) return { ok: false, error: 'Unauthorized', code: 401 };

    const initiator = this.playersState.get(userId);
    if (!initiator) return { ok: false, error: 'Player not found', code: 404 };

    if (params.partyType === 'duo' && params.partnerId) {
      const partner = this.playersState.get(params.partnerId);
      if (!partner) return { ok: false, error: 'Partner not found', code: 404 };

      // Compatibility check
      if (params.mode === 'ranked') {
        const compatible = areCompetitivePlayersCompatible([
          { rating: initiator.rating, tier: initiator.tier },
          { rating: partner.rating, tier: partner.tier },
        ]);
        if (!compatible) {
          return { ok: false, error: 'Competitive MMR difference exceeds 300 points', code: 409 };
        }
      }

      // Side preference compatibility
      if (params.sidePreference && params.partnerSidePreference) {
        const sidesOk = areTeamSidesCompatible([
          { id: userId, sidePreference: params.sidePreference },
          { id: params.partnerId, sidePreference: params.partnerSidePreference },
        ]);
        if (!sidesOk) {
          return { ok: false, error: 'Both partners cannot demand same exclusive court side', code: 409 };
        }
      }

      // Dispatch partner push invitation
      await pushService.dispatchEventToUsers([params.partnerId], {
        type: 'match-search-invitation',
        title: 'Convite para buscar uma partida',
        body: `${initiator.displayName} convidou você para formar uma dupla.`,
        data: { inviterId: userId },
      });
    }

    const searchId = `search-${Math.random().toString(36).substring(2, 8)}`;
    this.matchSearches.set(searchId, { id: searchId, userId, ...params });
    return { ok: true, searchId };
  }

  async cancelMatchSearch(searchId: string): Promise<{ ok: boolean }> {
    this.matchSearches.delete(searchId);
    return { ok: true };
  }

  async formMatch(matchData: any): Promise<{ ok: boolean; matchId: string }> {
    const matchId = matchData.id ?? `match-${Math.random().toString(36).substring(2, 8)}`;
    const match = {
      ...matchData,
      id: matchId,
      status: 'confirming',
      acceptances: new Map<string, boolean>(),
      attendances: new Map<string, boolean>(),
      votes: new Map<string, any>(),
    };
    this.matchesState.set(matchId, match);

    // Dispatch match formed push to all 4 participants
    const participants = [
      match.teamA.player1Id,
      match.teamA.player2Id,
      match.teamB.player1Id,
      match.teamB.player2Id,
    ];
    await pushService.dispatchEventToUsers(participants, {
      type: 'match-formed',
      title: 'Partida encontrada — confirme',
      body: 'Encontramos quatro jogadores compatíveis. Abra a partida e confirme.',
      data: { matchId },
    });

    return { ok: true, matchId };
  }

  async acceptMatch(matchId: string, decision: 'accept' | 'decline'): Promise<{ ok: boolean; status: string }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) return { ok: false, status: 'unauthorized' };

    const match = this.matchesState.get(matchId);
    if (!match) return { ok: false, status: 'not-found' };

    if (decision === 'decline') {
      match.status = 'cancelled';
      this.matchesState.set(matchId, match);

      const participants = [
        match.teamA.player1Id,
        match.teamA.player2Id,
        match.teamB.player1Id,
        match.teamB.player2Id,
      ];
      await pushService.dispatchEventToUsers(participants, {
        type: 'match-cancelled',
        title: 'Partida cancelada',
        body: 'Um jogador recusou a partida.',
        data: { matchId },
      });

      return { ok: true, status: 'cancelled' };
    }

    match.acceptances.set(userId, true);
    if (match.acceptances.size === 4) {
      match.status = 'confirmed';
      const participants = [
        match.teamA.player1Id,
        match.teamA.player2Id,
        match.teamB.player1Id,
        match.teamB.player2Id,
      ];
      await pushService.dispatchEventToUsers(participants, {
        type: 'match-confirmed',
        title: 'Partida confirmada pelos quatro',
        body: 'Todos aceitaram jogar. No horário marcado, confirmem presença na quadra.',
        data: { matchId },
      });
    }

    this.matchesState.set(matchId, match);
    return { ok: true, status: match.status };
  }

  async checkInAttendance(matchId: string): Promise<{ ok: boolean; status: string; code?: number; error?: string }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) return { ok: false, status: 'unauthorized', code: 401 };

    const match = this.matchesState.get(matchId);
    if (!match) return { ok: false, status: 'not-found', code: 404 };

    // Boundary: Check-in before startsAt is rejected
    if (new Date() < match.startsAt) {
      return { ok: false, status: 'too-early', error: 'Check-in only opens at match start time', code: 409 };
    }

    match.attendances.set(userId, true);
    if (match.attendances.size === 4) {
      const participants = [
        match.teamA.player1Id,
        match.teamA.player2Id,
        match.teamB.player1Id,
        match.teamB.player2Id,
      ];
      await pushService.dispatchEventToUsers(participants, {
        type: 'match-ready-to-play',
        title: 'Os quatro estão na quadra',
        body: 'Todos confirmaram presença. A partida está liberada para começar.',
        data: { matchId },
      });
    }

    this.matchesState.set(matchId, match);
    return { ok: true, status: `${match.attendances.size}/4 present` };
  }

  async submitMatchResult(
    matchId: string,
    sets: Array<{ a: number; b: number }>,
    winner: 'A' | 'B'
  ): Promise<{ ok: boolean; error?: string; code?: number }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) return { ok: false, error: 'Unauthorized', code: 401 };

    const match = this.matchesState.get(matchId);
    if (!match) return { ok: false, error: 'Match not found', code: 404 };

    const valid = validateBestOfThree({ sets, winner });
    if (!valid) {
      return { ok: false, error: 'Invalid score or winner does not match sets won', code: 400 };
    }

    match.sets = sets;
    match.winner = winner;
    match.status = 'result-pending';
    this.matchesState.set(matchId, match);

    // Notify participants to vote
    const participants = [
      match.teamA.player1Id,
      match.teamA.player2Id,
      match.teamB.player1Id,
      match.teamB.player2Id,
    ];
    await pushService.dispatchEventToUsers(participants, {
      type: 'result-submitted',
      title: 'Resultado aguardando confirmação',
      body: 'O placar foi enviado. Confirme o vencedor para liberar o ranking.',
      data: { matchId },
    });

    return { ok: true };
  }

  async voteResult(
    matchId: string,
    vote: { status: 'confirmed' | 'disputed'; winner?: 'A' | 'B' }
  ): Promise<{ ok: boolean; matchStatus: string; error?: string }> {
    const userId = await this.resolveCurrentUserId();
    if (!userId) return { ok: false, matchStatus: 'unauthorized', error: 'Unauthorized' };

    const match = this.matchesState.get(matchId);
    if (!match) return { ok: false, matchStatus: 'not-found', error: 'Match not found' };

    // Determine user's team
    const isTeamA = match.teamA.player1Id === userId || match.teamA.player2Id === userId;
    const team: 'A' | 'B' = isTeamA ? 'A' : 'B';

    match.votes.set(userId, {
      playerId: userId,
      team,
      status: vote.status,
      winner: vote.winner,
    });

    const voteList = Array.from(match.votes.values());

    // Check for conflict / dispute
    if (vote.status === 'disputed' || hasConflictingResult(voteList, match.winner)) {
      match.status = 'disputed';
      this.matchesState.set(matchId, match);

      const participants = [
        match.teamA.player1Id,
        match.teamA.player2Id,
        match.teamB.player1Id,
        match.teamB.player2Id,
      ];
      await pushService.dispatchEventToUsers(participants, {
        type: 'result-disputed',
        title: 'Resultado em análise',
        body: 'Os votos divergiram. O clube analisará a partida.',
        data: { matchId },
      });

      return { ok: true, matchStatus: 'disputed' };
    }

    // Check quorum
    if (canValidateResult(voteList, match.winner)) {
      match.status = 'validated';

      // Atomic rating update using Glicko-2
      const teamAPlayer1 = this.playersState.get(match.teamA.player1Id)!;
      const teamAPlayer2 = this.playersState.get(match.teamA.player2Id)!;
      const teamBPlayer1 = this.playersState.get(match.teamB.player1Id)!;
      const teamBPlayer2 = this.playersState.get(match.teamB.player2Id)!;

      if (teamAPlayer1 && teamAPlayer2 && teamBPlayer1 && teamBPlayer2) {
        const tA = teamRating([
          { rating: teamAPlayer1.rating, deviation: teamAPlayer1.deviation },
          { rating: teamAPlayer2.rating, deviation: teamAPlayer2.deviation },
        ]);
        const tB = teamRating([
          { rating: teamBPlayer1.rating, deviation: teamBPlayer1.deviation },
          { rating: teamBPlayer2.rating, deviation: teamBPlayer2.deviation },
        ]);
        const update = calculateRatingUpdate(tA, tB, match.winner);

        if (match.winner === 'A') {
          teamAPlayer1.rating += update.winnerDelta;
          teamAPlayer2.rating += update.winnerDelta;
          teamBPlayer1.rating = Math.max(800, teamBPlayer1.rating - update.loserDelta);
          teamBPlayer2.rating = Math.max(800, teamBPlayer2.rating - update.loserDelta);
        } else {
          teamBPlayer1.rating += update.winnerDelta;
          teamBPlayer2.rating += update.winnerDelta;
          teamAPlayer1.rating = Math.max(800, teamAPlayer1.rating - update.loserDelta);
          teamAPlayer2.rating = Math.max(800, teamAPlayer2.rating - update.loserDelta);
        }

        teamAPlayer1.matches += 1;
        teamAPlayer2.matches += 1;
        teamBPlayer1.matches += 1;
        teamBPlayer2.matches += 1;

        this.playersState.set(teamAPlayer1.id, teamAPlayer1);
        this.playersState.set(teamAPlayer2.id, teamAPlayer2);
        this.playersState.set(teamBPlayer1.id, teamBPlayer1);
        this.playersState.set(teamBPlayer2.id, teamBPlayer2);
      }

      this.matchesState.set(matchId, match);

      const participants = [
        match.teamA.player1Id,
        match.teamA.player2Id,
        match.teamB.player1Id,
        match.teamB.player2Id,
      ];
      await pushService.dispatchEventToUsers(participants, {
        type: 'match-validated',
        title: 'Partida validada',
        body: 'Resultado confirmado! Seu MMR e patente foram atualizados.',
        data: { matchId },
      });

      return { ok: true, matchStatus: 'validated' };
    }

    this.matchesState.set(matchId, match);
    return { ok: true, matchStatus: 'result-pending' };
  }

  // --- R1: Friends & Discovery ---

  async searchPlayers(query: string): Promise<{ ok: boolean; players: any[] }> {
    const q = query.trim().replace(/^@/, '').toLowerCase();
    const results: any[] = [];
    for (const player of this.playersState.values()) {
      const matchHandle = player.handle.toLowerCase().includes(q);
      const matchName = player.displayName.toLowerCase().includes(q);
      if (matchHandle || matchName) {
        // Guarantee privacy: never expose phone number in discovery
        const { phone, ...safeProfile } = player;
        results.push(safeProfile);
      }
    }
    return { ok: true, players: results };
  }

  async sendFriendRequest(targetUserId: string): Promise<{ ok: boolean; status: 'pending' | 'accepted' }> {
    const currentId = await this.resolveCurrentUserId();
    if (!currentId) throw new Error('Unauthorized');

    const key = `${currentId}:${targetUserId}`;
    const reverseKey = `${targetUserId}:${currentId}`;

    // If reverse request exists, auto-accept mutual connection
    if (this.friendsState.has(reverseKey)) {
      const existing = this.friendsState.get(reverseKey)!;
      existing.status = 'accepted';
      this.friendsState.set(reverseKey, existing);
      this.friendsState.set(key, { id: `fr-${Date.now()}`, requesterId: currentId, addresseeId: targetUserId, status: 'accepted' });

      await pushService.dispatchEventToUsers([targetUserId], {
        type: 'friend-request-response',
        title: 'Solicitação aceita',
        body: 'Vocês agora estão conectados para montar duplas.',
      });

      return { ok: true, status: 'accepted' };
    }

    this.friendsState.set(key, { id: `fr-${Date.now()}`, requesterId: currentId, addresseeId: targetUserId, status: 'pending' });

    await pushService.dispatchEventToUsers([targetUserId], {
      type: 'friend-request',
      title: 'Nova solicitação de amizade',
      body: 'Um jogador quer adicionar você à rede competitiva.',
      data: { requesterId: currentId },
    });

    return { ok: true, status: 'pending' };
  }

  // --- R1: Geographic Leaderboard ---

  async getLeaderboard(scope: 'global' | 'state' | 'city' | 'club', scopeValue?: string): Promise<{
    ok: boolean;
    entries: Array<PlayerFixture & { rankPosition: number }>;
    currentUserRank?: number;
  }> {
    const currentId = await this.resolveCurrentUserId();
    let players = Array.from(this.playersState.values());

    if (scope === 'state' && scopeValue) {
      players = players.filter((p) => p.state.toUpperCase() === scopeValue.toUpperCase());
    } else if (scope === 'city' && scopeValue) {
      players = players.filter((p) => p.city.toLowerCase() === scopeValue.toLowerCase());
    } else if (scope === 'club' && scopeValue) {
      players = players.filter((p) => p.clubId === scopeValue);
    }

    // Sort descending by MMR rating
    players.sort((a, b) => b.rating - a.rating);

    const entries = players.map((p, index) => ({
      ...p,
      rankPosition: index + 1,
    }));

    const currentUserRank = currentId ? entries.find((e) => e.id === currentId)?.rankPosition : undefined;

    return { ok: true, entries, currentUserRank };
  }
}
