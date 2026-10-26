import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateOnboardingToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 3: Cross-Feature Combinations — Social Auth + Account Linking + Match History (R1 x R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-XFEAT-01: Links existing account with match history, then verifies parity across /api/me and /api/history', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player1;
    const initialRating = existingPlayer.rating;
    const initialTier = existingPlayer.tier;

    // Simulate pre-existing match played on web
    await client.formMatch({
      id: 'pre-existing-web-match-1',
      teamA: { player1Id: existingPlayer.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    // Mobile player links Apple ID
    const onboardingToken = await generateOnboardingToken(
      'apple',
      'apple-sub-linked-journey-1',
      'carlos_journey@apple.com'
    );

    const linkRes = await client.linkExistingAccount({
      onboardingToken,
      phone: existingPlayer.phone!,
      otpCode: '123456',
    });

    expect(linkRes.ok).toBe(true);
    expect(linkRes.token).toBeDefined();

    // Now query /api/me via mobile client with the newly issued Bearer token
    client.asMobile(linkRes.token);
    const meRes = await client.getMe();

    expect(meRes.ok).toBe(true);
    expect(meRes.player?.id).toBe(existingPlayer.id);
    expect(meRes.player?.rating).toBe(initialRating);
    expect(meRes.player?.tier).toBe(initialTier);

    // Query /api/history via mobile client
    const histRes = await client.getHistory();
    expect(histRes.ok).toBe(true);
    expect(histRes.history.some((m) => m.id === 'pre-existing-web-match-1')).toBe(true);
  });

  it('TC-XFEAT-02: Auto-linked social account preserves season progression and stats', async () => {
    const player = FIXTURE_PLAYERS.player3;
    client.asMobile();

    // Auto-link via Google token matching existing player email
    const autoLinkRes = await client.socialAuth({
      provider: 'google',
      idToken: `h.${Buffer.from(JSON.stringify({ sub: 'sub-auto-s1', email: player.email, email_verified: true })).toString('base64url')}.s`,
    });

    expect(autoLinkRes.ok).toBe(true);
    expect(autoLinkRes.status).toBe('authenticated');

    // Check season endpoint
    const seasonRes = await client.getSeason();
    expect(seasonRes.ok).toBe(true);
    expect(seasonRes.season.userStats.tier).toBe(player.tier);
    expect(seasonRes.season.userStats.points).toBe(player.points);
  });
});
