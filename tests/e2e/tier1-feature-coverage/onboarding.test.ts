import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateOnboardingToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Social Onboarding Flow (R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-ONBOARD-01: Successfully completes onboarding for a new player with unique @handle', async () => {
    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-fresh-100',
      'pedro@example.com',
      'Pedro Padel'
    );

    const res = await client.completeOnboarding({
      onboardingToken,
      displayName: 'Pedro Santos',
      handle: 'pedro_padel',
      city: 'Florianópolis',
      state: 'SC',
      category: '5ª',
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('authenticated');
    expect(res.token).toBeDefined();
    expect(res.player).toBeDefined();
    expect(res.player?.handle).toBe('@pedro_padel');
    expect(res.player?.city).toBe('Florianópolis');
    expect(res.player?.state).toBe('SC');
    expect(res.player?.tier).toBe('5ª II');
    expect(res.player?.points).toBe(50);
    expect(res.player?.rating).toBe(1500);
    expect(res.player?.matches).toBe(0);
  });

  it('TC-ONBOARD-02: Normalizes handle input containing spaces, accents, or uppercase letters', async () => {
    const onboardingToken = await generateOnboardingToken(
      'apple',
      'apple-sub-fresh-101',
      'marcos@example.com'
    );

    const res = await client.completeOnboarding({
      onboardingToken,
      displayName: 'Marcos Vinicius',
      handle: ' Marcos.Padel ',
      city: 'Joaçaba',
      state: 'sc',
      category: '4ª',
    });

    expect(res.ok).toBe(true);
    expect(res.player?.handle).toBe('@marcos.padel');
    expect(res.player?.state).toBe('SC');
    expect(res.player?.tier).toBe('4ª II');
    expect(res.player?.rating).toBe(1800);
  });

  it('TC-ONBOARD-03: Rejects onboarding if requested handle is already taken by another player (409)', async () => {
    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-fresh-102',
      'impostor@example.com'
    );

    // Try to take carlos_padel handle (already used by FIXTURE_PLAYERS.player1)
    const res = await client.completeOnboarding({
      onboardingToken,
      displayName: 'Impostor Carlos',
      handle: FIXTURE_PLAYERS.player1.handle,
      city: 'Joaçaba',
      state: 'SC',
      category: '4ª',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(409);
    expect(res.error).toMatch(/already taken/i);
  });

  it('TC-ONBOARD-04: Maps category "unknown" to default safe tier 6ª III with 1100 provisional MMR', async () => {
    const onboardingToken = await generateOnboardingToken(
      'google',
      'google-sub-fresh-103',
      'iniciante@example.com'
    );

    const res = await client.completeOnboarding({
      onboardingToken,
      displayName: 'Novo Atleta',
      handle: 'atleta_iniciante',
      city: 'Chapecó',
      state: 'SC',
      category: 'unknown',
    });

    expect(res.ok).toBe(true);
    expect(res.player?.tier).toBe('6ª III');
    expect(res.player?.rating).toBe(1100);
    expect(res.player?.points).toBe(50);
  });

  it('TC-ONBOARD-05: Rejects onboarding with invalid or expired onboarding token (401)', async () => {
    const res = await client.completeOnboarding({
      onboardingToken: 'malformed.or.expired.jwt.token',
      displayName: 'Bad Token User',
      handle: 'bad_token_user',
      city: 'Curitiba',
      state: 'PR',
      category: '5ª',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(401);
  });
});
