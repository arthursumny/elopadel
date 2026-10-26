import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as onboardingPost } from '@/app/api/auth/social/onboarding/route';
import { createOnboardingToken, clearConsumedTokens } from '@/lib/auth';
import { clearRuntimeOAuthStore } from '@/app/api/auth/social/service';
import { normalizeInitialCategory, INITIAL_CATEGORY_OPTIONS } from '@/lib/ranks';

const mockHeadersMap = new Map<string, string>();
const mockCookiesMap = new Map<string, { value: string }>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeadersMap.get(name.toLowerCase()) ?? null,
  })),
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookiesMap.get(name) ?? undefined,
    set: vi.fn((name: string, value: string) => {
      mockCookiesMap.set(name, { value });
    }),
  })),
}));

describe('Challenger M3: Adversarial Backend Onboarding & Wire Values Verification', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    clearRuntimeOAuthStore();
    clearConsumedTokens();
    vi.clearAllMocks();
  });

  describe('1. Category Wire Values & Normalization', () => {
    it('verifies all 8 canonical wire categories are recognized by normalizeInitialCategory', () => {
      const allowedCategories = ['6ª', '5ª', '4ª', '3ª', '2ª', '1ª', 'Elite', 'unknown'];
      for (const cat of allowedCategories) {
        expect(normalizeInitialCategory(cat)).toBe(cat);
      }
    });

    it('rejects invalid or non-canonical categories', () => {
      const invalid = ['7ª', 'Iniciante', 'iniciante', 'Pro', 'Bronze', '6a', ''];
      for (const inv of invalid) {
        expect(normalizeInitialCategory(inv)).toBeNull();
      }
    });
  });

  describe('2. POST /api/auth/social/onboarding Adversarial Invocations', () => {
    it('returns HTTP 400 when category is missing or empty string', async () => {
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'adv-sub-1',
        email: 'adv1@example.com',
        name: 'Adversarial One',
      });

      const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          name: 'Adversarial One',
          handle: 'adv_one',
          city: 'Curitiba',
          state: 'PR',
          category: '', // Empty category
        }),
      });

      const res = await onboardingPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('categoria são obrigatórios');
    });

    it('returns HTTP 400 when handle is below 3 characters', async () => {
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'adv-sub-2',
        email: 'adv2@example.com',
        name: 'Adversarial Two',
      });

      const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          name: 'Adversarial Two',
          handle: 'ab', // 2 chars
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      });

      const res = await onboardingPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Escolha uma arroba de 3 a 20 caracteres');
    });

    it('returns HTTP 400 when handle is a reserved handle keyword', async () => {
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'adv-sub-3',
        email: 'adv3@example.com',
        name: 'Adversarial Three',
      });

      const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          name: 'Adversarial Three',
          handle: 'admin',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      });

      const res = await onboardingPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Escolha uma arroba de 3 a 20 caracteres');
    });

    it('successfully processes onboarding with all 8 valid category wire values', async () => {
      const categories = ['6ª', '5ª', '4ª', '3ª', '2ª', '1ª', 'Elite', 'unknown'];

      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const sub = `adv-cat-sub-${i}-${Date.now()}`;
        const token = await createOnboardingToken({
          provider: 'google',
          emailVerified: true,
          sub,
          email: `advcat_${i}_${Date.now()}@example.com`,
          name: `Category Player ${cat}`,
        });

        const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            onboardingToken: token,
            name: `Player ${cat}`,
            handle: `player_cat_${i}_${Date.now().toString().slice(-4)}`,
            city: 'Joinville',
            state: 'SC',
            category: cat,
          }),
        });

        const res = await onboardingPost(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.status).toBe('authenticated');
        expect(data.token).toBeDefined();
        expect(data.user).toBeDefined();
      }
    });

    it('enforces replay protection: prevents consuming same onboardingToken twice', async () => {
      const sub = `replay-sub-1-${Date.now()}`;
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub,
        email: `replay_${Date.now()}@example.com`,
        name: 'Replay User',
      });

      const req1 = new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          name: 'Replay User',
          handle: `replay_first_${Date.now().toString().slice(-4)}`,
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      });

      const res1 = await onboardingPost(req1);
      expect(res1.status).toBe(201);

      // Second attempt with exact same token
      const req2 = new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          name: 'Replay User Second',
          handle: `replay_sec_${Date.now().toString().slice(-4)}`,
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      });

      const res2 = await onboardingPost(req2);
      expect(res2.status).toBe(401);
      const data2 = await res2.json();
      expect(data2.error).toContain('já utilizado ou expirado');
    });
  });
});
