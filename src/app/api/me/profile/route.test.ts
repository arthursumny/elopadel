import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), db: {} as object | null, loadProfileEdit: vi.fn(), saveProfileEdit: vi.fn() }));
vi.mock('@/lib/auth', () => ({ currentUserId: mocks.currentUserId }));
vi.mock('@/lib/db', () => ({ get db() { return mocks.db; } }));
vi.mock('@/lib/profile-edit', () => ({
  loadProfileEdit: mocks.loadProfileEdit,
  saveProfileEdit: mocks.saveProfileEdit,
  ProfileEditError: class ProfileEditError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
}));

import { GET, PATCH } from './route';

describe('/api/me/profile', () => {
  beforeEach(() => {
    mocks.currentUserId.mockReset();
    mocks.loadProfileEdit.mockReset();
    mocks.saveProfileEdit.mockReset();
  });

  it('requires the server session and does not cache unauthorized replies', async () => {
    mocks.currentUserId.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 503 when no database is configured', async () => {
    mocks.db = null;
    mocks.currentUserId.mockResolvedValue('session-user');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.loadProfileEdit).not.toHaveBeenCalled();
    mocks.db = {};
  });

  it('rejects malformed JSON without saving', async () => {
    mocks.currentUserId.mockResolvedValue('session-user');
    const request = new Request('http://localhost/api/me/profile', { method: 'PATCH', body: '{' });
    const response = await PATCH(request);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.saveProfileEdit).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload and malformed club UUID before the service', async () => {
    mocks.currentUserId.mockResolvedValue('session-user');
    const badShape = await PATCH(new Request('http://localhost/api/me/profile', { method: 'PATCH', body: JSON.stringify({ city: 42, state: 'SP', country: 'Brasil', clubId: null }) }));
    const badClub = await PATCH(new Request('http://localhost/api/me/profile', { method: 'PATCH', body: JSON.stringify({ city: 'C', state: 'SP', country: 'Brasil', clubId: 'not-a-uuid' }) }));
    expect(badShape.status).toBe(400);
    expect(badClub.status).toBe(400);
    expect(badClub.headers.get('cache-control')).toBe('no-store');
    expect(mocks.saveProfileEdit).not.toHaveBeenCalled();
  });

  it('marks successful reads and service failures no-store', async () => {
    mocks.currentUserId.mockResolvedValue('session-user');
    mocks.loadProfileEdit.mockResolvedValue({ city: 'C', state: 'SP', country: 'Brasil', clubId: null, clubStatus: 'none', currentClub: null });
    const success = await GET();
    expect(success.status).toBe(200);
    expect(success.headers.get('cache-control')).toBe('no-store');
    mocks.loadProfileEdit.mockRejectedValue(new Error('connection failed'));
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
  });

  it('uses the authenticated user rather than a client-supplied userId', async () => {
    mocks.currentUserId.mockResolvedValue('session-user');
    mocks.saveProfileEdit.mockResolvedValue({ city: 'C', state: 'ST', country: 'Brasil', clubId: null, clubStatus: 'none', currentClub: null });
    const request = new Request('http://localhost/api/me/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'attacker-user', city: 'C', state: 'ST', country: 'Brasil', clubId: null }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(mocks.saveProfileEdit).toHaveBeenCalledWith('session-user', { city: 'C', state: 'ST', country: 'Brasil', clubId: null });
  });
});
