import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { createMockGoogleIdToken, generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 4: Real-World Workload — Journey of a New Mobile Player (R1, R2, R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-JOURNEY-01: End-to-end journey from first social login to victorious match and rating advancement', async () => {
    // === Step 1: First-time Social Login on Mobile ===
    const googleToken = createMockGoogleIdToken({
      sub: 'google-sub-journey-new-player',
      email: 'rodrigo.padel@gmail.com',
      emailVerified: true,
      name: 'Rodrigo Padel',
    });

    const loginRes = await client.socialAuth({
      provider: 'google',
      idToken: googleToken,
    });

    expect(loginRes.ok).toBe(true);
    expect(loginRes.status).toBe('needs_onboarding');
    expect(loginRes.onboardingToken).toBeDefined();

    // === Step 2: Complete Onboarding ===
    const onboardRes = await client.completeOnboarding({
      onboardingToken: loginRes.onboardingToken!,
      displayName: 'Rodrigo Pereira',
      handle: 'rodrigo_p',
      city: 'Joaçaba',
      state: 'SC',
      category: '4ª',
    });

    expect(onboardRes.ok).toBe(true);
    expect(onboardRes.token).toBeDefined();
    const newPlayer = onboardRes.player!;
    expect(newPlayer.handle).toBe('@rodrigo_p');
    expect(newPlayer.tier).toBe('4ª II');
    expect(newPlayer.rating).toBe(1800);
    expect(newPlayer.matches).toBe(0);

    // === Step 3: Register Native Device Push Token ===
    const deviceToken = 'ExponentPushToken[rodrigo-iphone-15]';
    const pushRegRes = await client.registerPushToken({
      token: deviceToken,
      platform: 'ios',
      deviceType: 'iPhone 15 Pro',
    });
    expect(pushRegRes.ok).toBe(true);

    // === Step 4: Search for a Friend and Send Connection Request ===
    const searchFriends = await client.searchPlayers('@marina');
    expect(searchFriends.players.length).toBeGreaterThanOrEqual(1);
    const friend = searchFriends.players[0];

    const friendReq = await client.sendFriendRequest(friend.id);
    expect(friendReq.ok).toBe(true);

    // === Step 5: Form Match with Opponents ===
    const opponent1 = FIXTURE_PLAYERS.player3;
    const opponent2 = FIXTURE_PLAYERS.player4;
    const partner = FIXTURE_PLAYERS.player2;

    const { matchId } = await client.formMatch({
      id: 'match-journey-rodrigo-01',
      startsAt: new Date(Date.now() - 5000), // Match at start time
      teamA: { player1Id: newPlayer.id, player2Id: partner.id },
      teamB: { player1Id: opponent1.id, player2Id: opponent2.id },
    });

    // Verify push notification for match formed arrived at Rodrigo's phone
    const rodrigoPushes = pushService.getSentForUser(newPlayer.id);
    expect(rodrigoPushes.some((p) => p.data?.type === 'match-formed')).toBe(true);

    // === Step 6: 4 Players Accept Match ===
    await client.acceptMatch(matchId, 'accept');

    // === Step 7: On-Court Attendance Check-in ===
    const checkInRes = await client.checkInAttendance(matchId);
    expect(checkInRes.ok).toBe(true);

    // === Step 8: Play Match & Submit Score ===
    // Team A (Rodrigo + Partner) wins 6-4, 3-6, 10-8 champions tiebreak
    const submitRes = await client.submitMatchResult(
      matchId,
      [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 8 }],
      'A'
    );
    expect(submitRes.ok).toBe(true);

    // === Step 9: 3-Vote Quorum Voting ===
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // Partner votes A
    const partnerToken = await generateSessionToken(partner.id);
    client.asMobile(partnerToken);
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // Opponent votes A
    const opponentToken = await generateSessionToken(opponent1.id);
    client.asMobile(opponentToken);
    const finalVote = await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });
    expect(finalVote.matchStatus).toBe('validated');

    // === Step 10: Verify Rodrigo's Profile and Rating Progression ===
    client.setAuthenticatedUser(newPlayer.id, onboardRes.token!);
    const updatedProfile = await client.getMe();
    expect(updatedProfile.ok).toBe(true);
    expect(updatedProfile.player?.matches).toBe(1);
    expect(updatedProfile.player?.rating).toBeGreaterThan(1800); // Gained MMR!

    // Verify match history includes this match
    const historyRes = await client.getHistory();
    expect(historyRes.ok).toBe(true);
    expect(historyRes.history.length).toBe(1);
  });
});
