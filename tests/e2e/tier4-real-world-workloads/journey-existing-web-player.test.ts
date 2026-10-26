import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateOnboardingToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 4: Real-World Workload — Journey of an Existing Web Player Transitioning to Mobile (R1, R2, R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-JOURNEY-02: Existing web player downloads app, links Apple ID, registers push notifications, and preserves all stats', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player2; // Marina Silva, 1820 MMR, 15 matches, 55 pts
    const initialRating = existingPlayer.rating;
    const initialMatches = existingPlayer.matches;
    const initialPoints = existingPlayer.points;
    const initialTier = existingPlayer.tier;

    // === Step 1: User opens Mobile App and Clicks "Sign in with Apple" ===
    const onboardingToken = await generateOnboardingToken(
      'apple',
      'apple-sub-marina-transition',
      'marina_apple@icloud.com'
    );

    // === Step 2: Clicks "Já tenho conta por telefone" and Links Account via OTP ===
    const linkRes = await client.linkExistingAccount({
      onboardingToken,
      phone: existingPlayer.phone!,
      otpCode: '123456',
    });

    expect(linkRes.ok).toBe(true);
    expect(linkRes.token).toBeDefined();

    // === Step 3: Mobile App Stores Bearer Token and Registers Push Token ===
    client.asMobile(linkRes.token);

    const pushRes = await client.registerPushToken({
      token: 'ExponentPushToken[marina-iphone-apple]',
      platform: 'ios',
      deviceType: 'iPhone 14',
    });
    expect(pushRes.ok).toBe(true);

    // === Step 4: Player Views Profile Screen (/api/me) ===
    const profileRes = await client.getMe();
    expect(profileRes.ok).toBe(true);
    expect(profileRes.player?.id).toBe(existingPlayer.id);
    expect(profileRes.player?.displayName).toBe(existingPlayer.displayName);
    expect(profileRes.player?.rating).toBe(initialRating);
    expect(profileRes.player?.tier).toBe(initialTier);
    expect(profileRes.player?.points).toBe(initialPoints);
    expect(profileRes.player?.matches).toBe(initialMatches);

    // === Step 5: Player Inspects City Leaderboard ===
    const cityLboard = await client.getLeaderboard('city', 'Joaçaba');
    expect(cityLboard.ok).toBe(true);
    expect(cityLboard.currentUserRank).toBeDefined();

    // === Step 6: Verify User Receives Push When an Invitation Arrives ===
    await pushService.dispatchEventToUsers([existingPlayer.id], {
      type: 'match-search-invitation',
      title: 'Convite para buscar partida',
      body: 'Carlos convidou você.',
    });

    const receivedPushes = pushService.getSentForUser(existingPlayer.id);
    expect(receivedPushes.length).toBe(1);
    expect(receivedPushes[0].to).toBe('ExponentPushToken[marina-iphone-apple]');
  });
});
