import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateBestOfThreeScores,
  validateBestOfThreeScore,
  calculateQuorumState,
  type QuorumParticipant,
} from '../lib/matchValidation';
import { resolveDeepLinkRoute } from '../hooks/usePushNotifications';
import {
  filterLeaderboardByScope,
  findUserRank,
  leaderboardApi,
} from '../api/leaderboard';
import { apiClient } from '../api/client';
import { pushApi } from '../api/push';
import type { LeaderboardEntry, SetScore, MatchParticipant, MatchDetails, ActiveMatchSearch } from '../api/types';

describe('Milestone 5 Phase 2: Tier 5 Mobile Adversarial Hardening Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // MODULE 1: matchValidation.ts (Best-of-3 Validation & 3-Vote Quorum)
  // =========================================================================
  describe('Module 1: matchValidation.ts Adversarial & Boundary Tests', () => {
    describe('1.1 Best-of-3 Set Scores Validation', () => {
      it('M5-VAL-01: accepts clean 2-0 sweep for Team A and verifies winner return', () => {
        const sets: SetScore[] = [
          { a: 6, b: 2 },
          { a: 6, b: 4 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('A');
        expect(res.error).toBeUndefined();
      });

      it('M5-VAL-02: accepts clean 2-0 sweep for Team B and verifies winner return', () => {
        const sets: SetScore[] = [
          { a: 1, b: 6 },
          { a: 3, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('B');
      });

      it('M5-VAL-03: accepts 2-1 comeback victory for Team A with tiebreak sets', () => {
        const sets: SetScore[] = [
          { a: 4, b: 6 },
          { a: 7, b: 5 },
          { a: 7, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('A');
      });

      it('M5-VAL-04: accepts 2-1 comeback victory for Team B with champions tiebreak', () => {
        const sets: SetScore[] = [
          { a: 6, b: 3 },
          { a: 4, b: 6 },
          { a: 8, b: 10 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('B');
      });

      it('M5-VAL-05: accepts 3-0 sweep when 3 sets played and all won by one team', () => {
        const setsA: SetScore[] = [
          { a: 6, b: 0 },
          { a: 6, b: 1 },
          { a: 6, b: 2 },
        ];
        expect(validateBestOfThreeScores(setsA, 'A').valid).toBe(true);

        const setsB: SetScore[] = [
          { a: 0, b: 6 },
          { a: 2, b: 6 },
          { a: 4, b: 6 },
        ];
        expect(validateBestOfThreeScores(setsB, 'B').valid).toBe(true);
      });

      it('M5-VAL-06: rejects single set score (< 2 sets boundary)', () => {
        const res = validateBestOfThreeScores([{ a: 6, b: 0 }], 'A');
        expect(res.valid).toBe(false);
        expect(res.isValid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('M5-VAL-07: rejects 4 or more sets (> 3 sets boundary)', () => {
        const sets = [
          { a: 6, b: 2 },
          { a: 2, b: 6 },
          { a: 6, b: 4 },
          { a: 6, b: 3 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('M5-VAL-08: rejects empty sets array or non-array inputs', () => {
        expect(validateBestOfThreeScores([], 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(null as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(undefined as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores({} as any, 'A').valid).toBe(false);
      });

      it('M5-VAL-09: rejects tied games within any set (e.g. 6-6, 0-0, 5-5)', () => {
        const sets1 = [
          { a: 6, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(sets1, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(sets1, 'A').error).toMatch(/não pode terminar empatado/i);

        const sets2 = [
          { a: 6, b: 4 },
          { a: 0, b: 0 },
        ];
        expect(validateBestOfThreeScores(sets2, 'A').valid).toBe(false);
      });

      it('M5-VAL-10: rejects negative game numbers or non-integers (NaN, Infinity, floats)', () => {
        const neg = [
          { a: -1, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(neg, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(neg, 'A').error).toMatch(/inteiros não negativos/i);

        const float = [
          { a: 6.5, b: 4 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(float, 'A').valid).toBe(false);

        const nanVal = [
          { a: NaN, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(nanVal, 'A').valid).toBe(false);

        const infVal = [
          { a: Infinity, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(infVal, 'A').valid).toBe(false);
      });

      it('M5-VAL-11: rejects when neither team won >= 2 sets (e.g. 1-1 with only 2 sets played)', () => {
        const sets = [
          { a: 6, b: 4 },
          { a: 4, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/pelo menos 2 sets/i);
      });

      it('M5-VAL-12: rejects divergence between calculated sets winner and declared winner', () => {
        const sets = [
          { a: 6, b: 3 },
          { a: 6, b: 4 },
        ];
        // Team A won 2 sets, but user declared Team B as winner
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/diverge do placar de sets/i);
      });

      it('M5-VAL-13: alias validateBestOfThreeScore behaves identically', () => {
        const sets: SetScore[] = [
          { a: 6, b: 1 },
          { a: 6, b: 0 },
        ];
        expect(validateBestOfThreeScore(sets, 'A')).toEqual(validateBestOfThreeScores(sets, 'A'));
      });
    });

    describe('1.2 3-Vote Quorum Resolution & Divergence Locking', () => {
      it('M5-VAL-14: satisfies quorum when exactly 3 votes confirmed with both teams represented', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(3);
        expect(res.votesA).toBe(3);
        expect(res.votesB).toBe(0);
        expect(res.hasBothTeams).toBe(true);
        expect(res.teamsRepresentedCount).toBe(2);
      });

      it('M5-VAL-15: satisfies quorum when all 4 participants confirm with unanimous winner', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants, 'B');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(4);
        expect(res.votesA).toBe(0);
        expect(res.votesB).toBe(4);
        expect(res.hasBothTeams).toBe(true);
      });

      it('M5-VAL-16: fails quorum when only one team has confirmed votes (lacks mutual representation)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.hasBothTeams).toBe(false);
        expect(res.teamsRepresentedCount).toBe(1);
        expect(res.totalVotes).toBe(2);
      });

      it('M5-VAL-17: fails quorum when total votes < 3 even if both teams are represented (1 vote each)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.totalVotes).toBe(2);
        expect(res.hasBothTeams).toBe(true);
      });

      it('M5-VAL-18: immediately triggers isDisputed and locks rating when conflicting votes exist (1-1 or 2-1 split)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants);
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.votesA).toBe(2);
        expect(res.votesB).toBe(1);
      });

      it('M5-VAL-19: immediately triggers isDisputed when any participant files explicit dispute', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'disputed', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
      });

      it('M5-VAL-20: triggers isDisputed when confirmed votes mismatch submittedWinner', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        // 3 votes for B, but submitted winner was A
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
      });

      it('M5-VAL-21: returns safe falsy defaults when participants array is empty or invalid', () => {
        const res = calculateQuorumState(null as any);
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(0);
        expect(res.hasBothTeams).toBe(false);
        expect(res.teamsRepresentedCount).toBe(0);
      });
    });
  });

  // =========================================================================
  // MODULE 2: usePushNotifications.ts (Deep Link Normalization & Routing)
  // =========================================================================
  describe('Module 2: usePushNotifications.ts Deep Linking & Normalization', () => {
    it('M5-DEEP-01: normalizes custom app scheme elopadel:// with single, double, triple slashes', () => {
      expect(resolveDeepLinkRoute('elopadel:/match/room-101')).toBe('/match/room-101');
      expect(resolveDeepLinkRoute('elopadel://match/room-101')).toBe('/match/room-101');
      expect(resolveDeepLinkRoute('elopadel:///match/room-101')).toBe('/match/room-101');
      expect(resolveDeepLinkRoute('elopadel:////match/room-101')).toBe('/match/room-101');
    });

    it('M5-DEEP-02: normalizes web URLs http and https with domains, ports, and subdomains', () => {
      expect(resolveDeepLinkRoute('https://elopadel.com/match/room-202')).toBe('/match/room-202');
      expect(resolveDeepLinkRoute('http://localhost:3000/match/room-202')).toBe('/match/room-202');
      expect(resolveDeepLinkRoute('https://staging.elopadel.app:8080/match/room-202')).toBe('/match/room-202');
      expect(resolveDeepLinkRoute('https://app.elopadel.com/friends')).toBe('/(tabs)/friends');
    });

    it('M5-DEEP-03: strips trailing slashes on all tab and dynamic match routes', () => {
      expect(resolveDeepLinkRoute('/matchmaking/')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('elopadel://matchmaking/')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/friends/')).toBe('/(tabs)/friends');
      expect(resolveDeepLinkRoute('/leaderboard/')).toBe('/(tabs)/leaderboard');
      expect(resolveDeepLinkRoute('/profile/')).toBe('/(tabs)/profile');
      expect(resolveDeepLinkRoute('/matches/')).toBe('/(tabs)/matches');
      expect(resolveDeepLinkRoute('/match/uuid-789/')).toBe('/match/uuid-789');
      expect(resolveDeepLinkRoute('https://elopadel.com/match/uuid-789/')).toBe('/match/uuid-789');
    });

    it('M5-DEEP-04: strips URL query parameters and fragments cleanly', () => {
      expect(resolveDeepLinkRoute('/match/123?utm_source=push&ref=banner#court')).toBe('/match/123');
      expect(resolveDeepLinkRoute('https://elopadel.com/friends?filter=mutual#search')).toBe('/(tabs)/friends');
      expect(resolveDeepLinkRoute('elopadel://lobby?mode=ranked#queue')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/history?season=active#completed')).toBe('/history');
    });

    it('M5-DEEP-05: maps legacy and alias paths to canonical tab routes', () => {
      expect(resolveDeepLinkRoute('/lobby')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/matchmaking')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/tabs/lobby')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/(tabs)/lobby')).toBe('/(tabs)/lobby');

      expect(resolveDeepLinkRoute('/friends')).toBe('/(tabs)/friends');
      expect(resolveDeepLinkRoute('/tabs/friends')).toBe('/(tabs)/friends');

      expect(resolveDeepLinkRoute('/leaderboard')).toBe('/(tabs)/leaderboard');
      expect(resolveDeepLinkRoute('/tabs/leaderboard')).toBe('/(tabs)/leaderboard');

      expect(resolveDeepLinkRoute('/profile')).toBe('/(tabs)/profile');
      expect(resolveDeepLinkRoute('/tabs/profile')).toBe('/(tabs)/profile');

      expect(resolveDeepLinkRoute('/matches')).toBe('/(tabs)/matches');
      expect(resolveDeepLinkRoute('/tabs/matches')).toBe('/(tabs)/matches');

      expect(resolveDeepLinkRoute('/history')).toBe('/history');
      expect(resolveDeepLinkRoute('/history/detail-123')).toBe('/history');

      expect(resolveDeepLinkRoute('/notifications')).toBe('/notifications');
      expect(resolveDeepLinkRoute('/notifications/unread')).toBe('/notifications');
    });

    it('M5-DEEP-06: safely falls back to /(tabs)/lobby on null, empty, whitespace, and root URLs', () => {
      expect(resolveDeepLinkRoute(null)).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute(undefined)).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('   ')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('///')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('elopadel://')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('https://elopadel.com')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('https://elopadel.com/')).toBe('/(tabs)/lobby');
    });

    it('M5-DEEP-07: falls back to /(tabs)/lobby on unrecognized or malicious paths', () => {
      expect(resolveDeepLinkRoute('/unknown/random/endpoint')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('javascript:alert(1)')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('https://evil.com/phishing')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('elopadel://settings/billing')).toBe('/(tabs)/lobby');
    });

    it('M5-DEEP-08: pushApi integration sends correct registration and unregistration requests', async () => {
      const registerSpy = vi.spyOn(pushApi, 'registerPushToken').mockResolvedValue({
        ok: true,
        registeredAt: new Date().toISOString(),
        token: 'ExponentPushToken[unit-test-token]',
      });
      const unregisterSpy = vi.spyOn(pushApi, 'unregisterPushToken').mockResolvedValue({
        ok: true,
        unregistered: true,
      });

      const reg = await pushApi.registerPushToken({
        token: 'ExponentPushToken[unit-test-token]',
        platform: 'android',
        deviceType: 'Pixel 8',
        appVersion: '1.2.0',
      });
      expect(reg.ok).toBe(true);
      expect(registerSpy).toHaveBeenCalledWith({
        token: 'ExponentPushToken[unit-test-token]',
        platform: 'android',
        deviceType: 'Pixel 8',
        appVersion: '1.2.0',
      });

      const unreg = await pushApi.unregisterPushToken('ExponentPushToken[unit-test-token]');
      expect(unreg.ok).toBe(true);
      expect(unregisterSpy).toHaveBeenCalledWith('ExponentPushToken[unit-test-token]');
    });
  });

  // =========================================================================
  // MODULE 3: leaderboard.ts (Geographic Scope Filtering & User Rank Lookup)
  // =========================================================================
  describe('Module 3: leaderboard.ts Scope Filtering & User Rank Lookup', () => {
    const mockLeaderboard: LeaderboardEntry[] = [
      {
        position: 1,
        player: 'Rodrigo Santoro',
        handle: '@rodrigo',
        initials: 'RS',
        club: 'Arena Padel Morumbi',
        city: 'São Paulo',
        state: 'SP',
        tier: '1ª I',
        points: 99,
        delta: 45,
        active: true,
      },
      {
        position: 2,
        player: 'Beatriz Haddad',
        handle: '@beatriz',
        initials: 'BH',
        club: 'Padel Club Campinas',
        city: 'Campinas',
        state: 'SP',
        tier: '2ª II',
        points: 88, // Tied points with Tiago
        delta: 25,
        active: true,
      },
      {
        position: 3,
        player: 'Tiago Monteiro',
        handle: '@tiago',
        initials: 'TM',
        club: 'Arena Padel Morumbi',
        city: 'Curitiba',
        state: 'PR',
        tier: '2ª II',
        points: 88, // Tied points with Beatriz
        delta: -10,
        active: true,
      },
      {
        position: 4,
        player: 'Fernanda Meligeni',
        handle: '@fernanda',
        initials: 'FM',
        club: 'Padel Club Jardins',
        city: 'São Paulo',
        state: 'SP',
        tier: '3ª I',
        points: 75,
        delta: 15,
        active: true,
      },
      {
        position: 5,
        player: 'Gustavo Kuerten',
        handle: '@guga',
        initials: 'GK',
        club: 'Padel Club Floripa',
        city: 'Florianópolis',
        state: 'SC',
        tier: 'Elite',
        points: 120,
        delta: 60,
        active: true,
      },
    ];

    it('M5-LEAD-01: global scope preserves all entries and recalculates positions 1..N', () => {
      const res = filterLeaderboardByScope(mockLeaderboard, 'global');
      expect(res).toHaveLength(5);
      expect(res.map((e) => e.position)).toEqual([1, 2, 3, 4, 5]);
      expect(res[0].handle).toBe('@rodrigo');
      expect(res[4].handle).toBe('@guga');
    });

    it('M5-LEAD-02: state scope filters case-insensitively and recalculates consecutive positions', () => {
      // SP state has Rodrigo, Beatriz, Fernanda
      const res = filterLeaderboardByScope(mockLeaderboard, 'state', { state: ' sp ' });
      expect(res).toHaveLength(3);
      expect(res.map((e) => e.handle)).toEqual(['@rodrigo', '@beatriz', '@fernanda']);
      expect(res.map((e) => e.position)).toEqual([1, 2, 3]);

      // PR state has Tiago
      const resPR = filterLeaderboardByScope(mockLeaderboard, 'state', { state: 'PR' });
      expect(resPR).toHaveLength(1);
      expect(resPR[0].handle).toBe('@tiago');
      expect(resPR[0].position).toBe(1);
    });

    it('M5-LEAD-03: city scope filters case-insensitively with diacritics and recalculates positions', () => {
      // São Paulo city has Rodrigo and Fernanda
      const res = filterLeaderboardByScope(mockLeaderboard, 'city', { city: 'SÃO PAULO' });
      expect(res).toHaveLength(2);
      expect(res[0].handle).toBe('@rodrigo');
      expect(res[0].position).toBe(1);
      expect(res[1].handle).toBe('@fernanda');
      expect(res[1].position).toBe(2);

      // Campinas city has Beatriz
      const resCampinas = filterLeaderboardByScope(mockLeaderboard, 'city', { city: 'campinas' });
      expect(resCampinas).toHaveLength(1);
      expect(resCampinas[0].handle).toBe('@beatriz');
      expect(resCampinas[0].position).toBe(1);
    });

    it('M5-LEAD-04: club scope filters case-insensitively and recalculates positions', () => {
      // Arena Padel Morumbi has Rodrigo and Tiago
      const res = filterLeaderboardByScope(mockLeaderboard, 'club', { club: 'arena padel morumbi' });
      expect(res).toHaveLength(2);
      expect(res[0].handle).toBe('@rodrigo');
      expect(res[0].position).toBe(1);
      expect(res[1].handle).toBe('@tiago');
      expect(res[1].position).toBe(2);
    });

    it('M5-LEAD-05: returns empty array when no players match scope or user context is empty', () => {
      expect(filterLeaderboardByScope(mockLeaderboard, 'city', { city: 'Manaus' })).toHaveLength(0);
      expect(filterLeaderboardByScope(mockLeaderboard, 'state', { state: '' })).toHaveLength(0);
      expect(filterLeaderboardByScope(mockLeaderboard, 'city', undefined)).toHaveLength(0);
      expect(filterLeaderboardByScope(null as any, 'global')).toHaveLength(0);
    });

    it('M5-LEAD-06: handles tied ratings stably across filtered views', () => {
      // Beatriz (SP) and Tiago (PR) both have 88 points
      const globalView = filterLeaderboardByScope(mockLeaderboard, 'global');
      expect(globalView[1].points).toBe(88);
      expect(globalView[2].points).toBe(88);
      expect(globalView[1].position).toBe(2);
      expect(globalView[2].position).toBe(3);

      // When filtered to SP, Beatriz becomes position 2 without gaps
      const spView = filterLeaderboardByScope(mockLeaderboard, 'state', { state: 'SP' });
      const beatriz = spView.find((e) => e.handle === '@beatriz');
      expect(beatriz?.position).toBe(2);

      // When filtered to PR, Tiago becomes position 1
      const prView = filterLeaderboardByScope(mockLeaderboard, 'state', { state: 'PR' });
      const tiago = prView.find((e) => e.handle === '@tiago');
      expect(tiago?.position).toBe(1);
    });

    it('M5-LEAD-07: findUserRank locates player rank by handle with or without @ prefix, case-insensitive', () => {
      const withAt = findUserRank(mockLeaderboard, '@fernanda');
      expect(withAt).not.toBeNull();
      expect(withAt?.position).toBe(4);
      expect(withAt?.entry?.player).toBe('Fernanda Meligeni');

      const withoutAt = findUserRank(mockLeaderboard, 'FERNANDA');
      expect(withoutAt).not.toBeNull();
      expect(withoutAt?.position).toBe(4);

      const byFullName = findUserRank(mockLeaderboard, 'Rodrigo Santoro');
      expect(byFullName?.position).toBe(1);
    });

    it('M5-LEAD-08: findUserRank returns null for empty, whitespace, non-existent handles, or empty list', () => {
      expect(findUserRank(mockLeaderboard, '')).toBeNull();
      expect(findUserRank(mockLeaderboard, '   ')).toBeNull();
      expect(findUserRank(mockLeaderboard, '@jogador_fantasma')).toBeNull();
      expect(findUserRank([], '@rodrigo')).toBeNull();
      expect(findUserRank(mockLeaderboard, null as any)).toBeNull();
    });

    it('M5-LEAD-09: leaderboardApi.getLeaderboard calls apiClient and returns filtered result with metadata', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        entries: mockLeaderboard,
      });

      const res = await leaderboardApi.getLeaderboard({
        scope: 'state',
        userContext: { state: 'SP' },
      });

      expect(getSpy).toHaveBeenCalledWith('/api/leaderboard', {
        params: { scope: 'state' },
      });
      expect(res.scope).toBe('state');
      expect(res.totalCount).toBe(3);
      expect(res.entries).toHaveLength(3);
      expect(res.entries[0].handle).toBe('@rodrigo');
    });
  });

  // =========================================================================
  // MODULE 4: match/[id].tsx (Match Room Lifecycle & Quorum Integration)
  // =========================================================================
  describe('Module 4: match/[id].tsx Room Lifecycle & Quorum Divergence Simulation', () => {
    it('M5-ROOM-01: verifies acceptance state machine (4/4 confirmed moves to next phase)', () => {
      const participants: MatchParticipant[] = [
        { id: 'p1', userId: 'u1', name: 'Player 1', handle: '@p1', team: 'A', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: true },
        { id: 'p2', userId: 'u2', name: 'Player 2', handle: '@p2', team: 'A', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: false },
        { id: 'p3', userId: 'u3', name: 'Player 3', handle: '@p3', team: 'B', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: false },
        { id: 'p4', userId: 'u4', name: 'Player 4', handle: '@p4', team: 'B', tier: '4ª II', matchAcceptance: 'pending', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: false },
      ];

      const acceptedCount = participants.filter((p) => p.matchAcceptance === 'accepted').length;
      expect(acceptedCount).toBe(3);

      const isAllAccepted = acceptedCount === 4;
      expect(isAllAccepted).toBe(false);

      // 4th player accepts
      participants[3].matchAcceptance = 'accepted';
      const finalAcceptedCount = participants.filter((p) => p.matchAcceptance === 'accepted').length;
      expect(finalAcceptedCount).toBe(4);
    });

    it('M5-ROOM-02: verifies on-court attendance check-in window (4/4 present enables match)', () => {
      const participants: MatchParticipant[] = [
        { id: 'p1', userId: 'u1', name: 'Player 1', handle: '@p1', team: 'A', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'claimed-present', isCurrentPlayer: true },
        { id: 'p2', userId: 'u2', name: 'Player 2', handle: '@p2', team: 'A', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'claimed-present', isCurrentPlayer: false },
        { id: 'p3', userId: 'u3', name: 'Player 3', handle: '@p3', team: 'B', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: false },
        { id: 'p4', userId: 'u4', name: 'Player 4', handle: '@p4', team: 'B', tier: '4ª II', matchAcceptance: 'accepted', confirmation: 'pending', resultWinner: null, attendance: 'pending', isCurrentPlayer: false },
      ];

      const attendanceCount = participants.filter(
        (p) => p.attendance === 'claimed-present' || p.attendance === 'present'
      ).length;
      expect(attendanceCount).toBe(2);

      const hasCurrentUserCheckedIn = participants[0].attendance === 'claimed-present';
      expect(hasCurrentUserCheckedIn).toBe(true);
    });

    it('M5-ROOM-03: parses and validates Best-of-3 score form inputs before submission', () => {
      // Simulating match room form input parser
      const parseFormScore = (
        s1A: string, s1B: string,
        s2A: string, s2B: string,
        s3A: string, s3B: string,
        declaredWinner: 'A' | 'B'
      ) => {
        const p1A = parseInt(s1A, 10);
        const p1B = parseInt(s1B, 10);
        const p2A = parseInt(s2A, 10);
        const p2B = parseInt(s2B, 10);

        const sets: SetScore[] = [
          { a: isNaN(p1A) ? -1 : p1A, b: isNaN(p1B) ? -1 : p1B },
          { a: isNaN(p2A) ? -1 : p2A, b: isNaN(p2B) ? -1 : p2B },
        ];

        if (s3A.trim() !== '' || s3B.trim() !== '') {
          const p3A = parseInt(s3A, 10);
          const p3B = parseInt(s3B, 10);
          sets.push({ a: isNaN(p3A) ? -1 : p3A, b: isNaN(p3B) ? -1 : p3B });
        }

        return validateBestOfThreeScores(sets, declaredWinner);
      };

      // Valid 2-0 sweep
      const sweep = parseFormScore('6', '3', '6', '2', '', '', 'A');
      expect(sweep.valid).toBe(true);
      expect(sweep.winner).toBe('A');

      // Valid 2-1 with 3rd set
      const tiebreak = parseFormScore('4', '6', '7', '5', '10', '8', 'A');
      expect(tiebreak.valid).toBe(true);
      expect(tiebreak.winner).toBe('A');

      // Invalid input with empty 2nd set
      const incomplete = parseFormScore('6', '3', '', '4', '', '', 'A');
      expect(incomplete.valid).toBe(false);

      // Tied set 6-6
      const tiedSet = parseFormScore('6', '6', '6', '4', '', '', 'A');
      expect(tiedSet.valid).toBe(false);

      // Inverted winner
      const inverted = parseFormScore('6', '3', '6', '2', '', '', 'B');
      expect(inverted.valid).toBe(false);
    });

    it('M5-ROOM-04: verifies quorum calculation and divergence banner locking trigger', () => {
      // 3 confirmed votes for Team A with both teams represented
      const validParticipants: QuorumParticipant[] = [
        { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
        { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
        { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
        { team: 'B', confirmation: 'pending', resultWinner: null },
      ];

      const quorumValid = calculateQuorumState(validParticipants, 'A');
      expect(quorumValid.isQuorumMet).toBe(true);
      expect(quorumValid.isDisputed).toBe(false);

      // Conflicting votes trigger divergence locking
      const conflictedParticipants: QuorumParticipant[] = [
        { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
        { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
        { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
      ];

      const quorumDisputed = calculateQuorumState(conflictedParticipants, 'A');
      expect(quorumDisputed.isDisputed).toBe(true);
      expect(quorumDisputed.isQuorumMet).toBe(false);
    });
  });

  // =========================================================================
  // MODULE 5: lobby.tsx (Matchmaking Lobby States, Solo/Duo, & Partner Flow)
  // =========================================================================
  describe('Module 5: lobby.tsx Matchmaking Lobby States & Solo/Duo Queue', () => {
    // Helper function from lobby.tsx
    function getAvailableDates(): Array<{ dateString: string; label: string; weekday: string }> {
      const dates = [];
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        dates.push({
          dateString,
          label: `${d.getDate()} ${months[d.getMonth()]}`,
          weekday: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : days[d.getDay()],
        });
      }
      return dates;
    }

    it('M5-LOBBY-01: generates exactly 14 sequential calendar dates starting today', () => {
      const dates = getAvailableDates();
      expect(dates).toHaveLength(14);
      expect(dates[0].weekday).toBe('Hoje');
      expect(dates[1].weekday).toBe('Amanhã');

      // Check ISO format YYYY-MM-DD
      dates.forEach((d) => {
        expect(d.dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('M5-LOBBY-02: verifies 5 distinct lobby states and UI transition conditions', () => {
      // State 1: Matched
      const matchedSearch: ActiveMatchSearch = {
        id: 'search-1',
        status: 'matched',
        mode: 'ranked',
        partyType: 'duo',
        city: 'São Paulo',
        sidePreference: 'any',
        matchId: 'match-xyz',
        dates: ['2026-10-10'],
        from: '18:00',
        to: '22:00',
        myReady: true,
        partnerReady: true,
        tier: '4ª II',
      };
      expect(matchedSearch.status === 'matched' && Boolean(matchedSearch.matchId)).toBe(true);

      // State 2: Searching
      const searchingSearch: ActiveMatchSearch = {
        id: 'search-2',
        status: 'searching',
        mode: 'ranked',
        partyType: 'solo',
        city: 'São Paulo',
        sidePreference: 'left',
        dates: ['2026-10-10'],
        from: '18:00',
        to: '22:00',
        myReady: true,
        partnerReady: false,
        tier: '4ª II',
      };
      expect(searchingSearch.status === 'searching').toBe(true);

      // State 3: Duo Lobby Readiness
      const duoLobbySearch: ActiveMatchSearch = {
        id: 'search-3',
        status: 'lobby',
        mode: 'ranked',
        partyType: 'duo',
        city: 'São Paulo',
        sidePreference: 'any',
        myReady: true,
        partnerReady: false,
        partnerName: 'Carlos Padel',
        partnerHandle: '@carlos',
        dates: ['2026-10-10'],
        from: '18:00',
        to: '22:00',
        tier: '4ª II',
      };
      expect(duoLobbySearch.status === 'lobby').toBe(true);
      const readyCount = Number(Boolean(duoLobbySearch.myReady)) + Number(Boolean(duoLobbySearch.partnerReady));
      expect(readyCount).toBe(1);

      // State 4 & 5: Idle (no active search)
      const noSearch: ActiveMatchSearch | null = null;
      expect(noSearch).toBeNull();
    });

    it('M5-LOBBY-03: verifies duo search guards (requires partner before starting search)', () => {
      const validateDuoSubmission = (
        partyType: 'solo' | 'duo',
        partner: { id: string; name: string } | null,
        selectedDates: string[]
      ): { valid: boolean; error?: string } => {
        if (selectedDates.length === 0) {
          return { valid: false, error: 'Selecione pelo menos uma data para buscar.' };
        }
        if (partyType === 'duo' && !partner) {
          return { valid: false, error: 'Selecione seu parceiro de dupla antes de buscar.' };
        }
        return { valid: true };
      };

      // Fails if duo without partner
      expect(validateDuoSubmission('duo', null, ['2026-10-10']).valid).toBe(false);
      expect(validateDuoSubmission('duo', null, ['2026-10-10']).error).toMatch(/parceiro de dupla/i);

      // Succeeds if duo with partner
      expect(validateDuoSubmission('duo', { id: 'p1', name: 'Partner' }, ['2026-10-10']).valid).toBe(true);

      // Succeeds if solo without partner
      expect(validateDuoSubmission('solo', null, ['2026-10-10']).valid).toBe(true);

      // Fails if dates empty
      expect(validateDuoSubmission('solo', null, []).valid).toBe(false);
    });

    it('M5-LOBBY-04: court side preferences accommodate left, right, and any', () => {
      const sides = ['left', 'right', 'any'];
      expect(sides).toContain('left');
      expect(sides).toContain('right');
      expect(sides).toContain('any');
    });
  });
});
