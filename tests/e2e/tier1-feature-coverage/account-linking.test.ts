import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateOnboardingToken, createMockGoogleIdToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Account Linking & Historical Integrity (R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-LINK-01: Successfully links social provider to existing account via phone OTP', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player1;
    const initialRating = existingPlayer.rating;
    const initialTier = existingPlayer.tier;
    const initialMatches = existingPlayer.matches;

    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-link-target-1',
      'carlos_alternate@gmail.com'
    );

    const res = await client.linkExistingAccount({
      onboardingToken,
      phone: existingPlayer.phone!,
      otpCode: '123456',
    });

    expect(res.ok).toBe(true);
    expect(res.player).toBeDefined();
    expect(res.player?.id).toBe(existingPlayer.id);
    // Crucial integrity check: MMR, Tier, and Matches must remain 100% intact
    expect(res.player?.rating).toBe(initialRating);
    expect(res.player?.tier).toBe(initialTier);
    expect(res.player?.matches).toBe(initialMatches);
  });

  it('TC-LINK-02: Subsequent login with linked social provider resolves to the existing profile', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player2;
    const linkedSub = 'apple-sub-linked-player-2';

    // Step 1: Link via onboarding token & OTP
    const onboardingToken = await generateOnboardingToken('apple', linkedSub, 'marina_new@apple.com');
    await client.linkExistingAccount({
      onboardingToken,
      phone: existingPlayer.phone!,
      otpCode: '123456',
    });

    // Step 2: Login directly using the newly linked provider account
    const res = await client.socialAuth({
      provider: 'apple',
      idToken: `header.${Buffer.from(JSON.stringify({ sub: linkedSub, email: 'marina_new@apple.com' })).toString('base64url')}.sig`,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.player?.id).toBe(existingPlayer.id);
    expect(res.player?.handle).toBe(existingPlayer.handle);
  });

  it('TC-LINK-03: Rejects account link if phone number is not found in database (404)', async () => {
    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-nonexistent',
      'random@example.com'
    );

    const res = await client.linkExistingAccount({
      onboardingToken,
      phone: '+5549999999999',
      otpCode: '123456',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(404);
  });

  it('TC-LINK-04: Rejects account link if OTP code is incorrect (400)', async () => {
    const existingPlayer = FIXTURE_PLAYERS.player1;
    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-wrong-otp',
      'test@example.com'
    );

    const res = await client.linkExistingAccount({
      onboardingToken,
      phone: existingPlayer.phone!,
      otpCode: '000000', // Invalid code
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(400);
    expect(res.error).toMatch(/invalid otp/i);
  });

  it('TC-LINK-05: Preserves calibrated MMR and provisional match count through email auto-link', async () => {
    const player = FIXTURE_PLAYERS.player4;
    const initialRating = player.rating;

    // Login with same verified email as player4
    const googleToken = createMockGoogleIdToken({
      sub: 'google-sub-auto-link-beatriz',
      email: player.email,
      emailVerified: true,
      name: player.displayName,
    });

    const res = await client.socialAuth({
      provider: 'google',
      idToken: googleToken,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.player?.id).toBe(player.id);
    expect(res.player?.rating).toBe(initialRating);
    expect(res.player?.provisionalMatches).toBe(player.provisionalMatches);
  });
});
