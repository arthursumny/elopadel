import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { createMockGoogleIdToken, createMockAppleIdentityToken, generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Social Authentication & Dual-Mode Sessions (R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-AUTH-01: Authenticates existing user with Google ID token and returns session token', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player1;
    const googleToken = createMockGoogleIdToken({
      sub: `google-sub-${existingPlayer.id}`,
      email: existingPlayer.email,
      emailVerified: true,
      name: existingPlayer.displayName,
    });

    const res = await client.socialAuth({
      provider: 'google',
      idToken: googleToken,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.token).toBeDefined();
    expect(typeof res.token).toBe('string');
    expect(res.player?.id).toBe(existingPlayer.id);
    expect(res.player?.handle).toBe(existingPlayer.handle);
  });

  it('TC-AUTH-02: Authenticates existing user with Apple Identity token and returns session token', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player2;
    const appleToken = createMockAppleIdentityToken({
      sub: `apple-sub-${existingPlayer.id}`,
      email: existingPlayer.email,
      emailVerified: true,
    });

    const res = await client.socialAuth({
      provider: 'apple',
      idToken: appleToken,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.token).toBeDefined();
    expect(res.player?.id).toBe(existingPlayer.id);
  });

  it('TC-AUTH-03: Flags new social user as needs_onboarding with onboarding token', async () => {
    const newSub = 'google-sub-brand-new-999';
    const googleToken = createMockGoogleIdToken({
      sub: newSub,
      email: 'fresh_padel_star@gmail.com',
      emailVerified: true,
      name: 'Fresh Padel Player',
    });

    const res = await client.socialAuth({
      provider: 'google',
      idToken: googleToken,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('needs_onboarding');
    expect(res.onboardingToken).toBeDefined();
    expect(res.profile?.email).toBe('fresh_padel_star@gmail.com');
    expect(res.profile?.suggestedName).toBe('Fresh Padel Player');
  });

  it('TC-AUTH-04: Resolves mobile session via Authorization: Bearer token header', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = await generateSessionToken(player.id, 'player');

    // Simulate mobile client passing Bearer token
    client.asMobile(token);
    const userId = await client.resolveCurrentUserId();

    expect(userId).toBe(player.id);
  });

  it('TC-AUTH-05: Resolves web browser session via Cookie fallback', async () => {
    const player = FIXTURE_PLAYERS.player2;
    const cookieToken = await generateSessionToken(player.id, 'player');

    // Simulate web client with cookie
    client.asWeb(cookieToken);
    const userId = await client.resolveCurrentUserId();

    expect(userId).toBe(player.id);
  });

  it('TC-AUTH-06: Automatically matches and links existing account if verified email matches', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player3;
    const newGoogleSub = 'google-sub-alternate-login-333';
    const googleToken = createMockGoogleIdToken({
      sub: newGoogleSub,
      email: existingPlayer.email, // Same email as player3 in DB
      emailVerified: true,
      name: existingPlayer.displayName,
    });

    const res = await client.socialAuth({
      provider: 'google',
      idToken: googleToken,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.player?.id).toBe(existingPlayer.id);
    expect(res.player?.rating).toBe(existingPlayer.rating);
  });
});
