import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateExpiredSessionToken, generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 2: Boundary & Corner Cases — Authentication Boundaries (R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-BND-AUTH-01: Rejects expired JWT session token with null resolution', async () => {
    const expiredToken = await generateExpiredSessionToken(FIXTURE_PLAYERS.player1.id);
    client.asMobile(expiredToken);

    const resolved = await client.resolveCurrentUserId();
    expect(resolved).toBeNull();

    const meRes = await client.getMe();
    expect(meRes.ok).toBe(false);
    expect(meRes.status).toBe(401);
  });

  it('TC-BND-AUTH-02: Rejects malformed and truncated Bearer token strings', async () => {
    client.asMobile('Bearer not-a-valid-jwt-token');
    const resolved = await client.resolveCurrentUserId();
    expect(resolved).toBeNull();
  });

  it('TC-BND-AUTH-03: Rejects token signed with wrong or untrusted secret key', async () => {
    // Manually craft a token with a different secret
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJyb2xlIjoicGxheWVyIn0.invalidSignatureForDifferentSecret';
    client.asMobile(fakeToken);

    const resolved = await client.resolveCurrentUserId();
    expect(resolved).toBeNull();
  });

  it('TC-BND-AUTH-04: Gracefully handles empty Bearer token or whitespace-only header', async () => {
    client.asMobile('   ');
    const resolved = await client.resolveCurrentUserId();
    expect(resolved).toBeNull();
  });

  it('TC-BND-AUTH-05: Rejects social authentication payload with empty idToken', async () => {
    const res = await client.socialAuth({
      provider: 'google',
      idToken: '',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/missing token/i);
  });
});
