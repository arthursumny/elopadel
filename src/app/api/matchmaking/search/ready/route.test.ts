import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  setReady: vi.fn(),
  active: vi.fn(),
  configured: vi.fn(),
  verify: vi.fn(),
  activeClub: vi.fn(),
  select: vi.fn(),
  search: null as null | Record<string, unknown>,
}));

vi.mock('@/lib/auth', () => ({ currentUserId: mocks.currentUserId }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/db/matchmaking', () => ({ setMatchSearchReady: mocks.setReady }));
vi.mock('@/lib/db/queries', () => ({ loadActiveMatchSearch: mocks.active }));
vi.mock('@/lib/location', () => ({
  isGeoapifyConfigured: mocks.configured,
  verifyLocationToken: mocks.verify,
  isActiveClubAtLocation: mocks.activeClub,
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/matchmaking/search/ready', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('POST /api/matchmaking/search/ready location rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue('partner-1');
    mocks.search = { id: 'search-1', mode: 'ranked', city: 'Joaçaba', state: 'SC', country: 'Brasil', clubId: null };
    mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => mocks.search ? [mocks.search] : [] }) }) }));
    mocks.setReady.mockResolvedValue({ started: false, matched: false });
    mocks.active.mockResolvedValue({ id: 'search-1' });
    mocks.configured.mockReturnValue(true);
    mocks.verify.mockResolvedValue({ city: 'Joaçaba', state: 'SC', country: 'Brasil', expiresAt: '2026-10-26T12:05:00.000Z' });
    mocks.activeClub.mockResolvedValue(true);
  });

  it('requires a fresh token matching the search for every ranked ready=true confirmation', async () => {
    const response = await POST(request({ searchId: 'search-1', ready: true, locationToken: 'partner-token' }));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith('partner-token', 'partner-1');
    expect(mocks.setReady).toHaveBeenCalledWith('search-1', 'partner-1', true, 'any', expect.objectContaining({ city: 'Joaçaba', state: 'SC' }));
  });

  it('rejects another city, legacy locationless searches, and a missing Geoapify key', async () => {
    mocks.verify.mockResolvedValue({ city: 'Chapecó', state: 'SC', country: 'Brasil', expiresAt: '2026-10-26T12:05:00.000Z' });
    expect((await POST(request({ searchId: 'search-1', ready: true, locationToken: 'token' }))).status).toBe(422);
    expect(mocks.setReady).not.toHaveBeenCalled();
    mocks.search = { id: 'search-1', mode: 'ranked', city: 'Joaçaba', state: null, country: null, clubId: null };
    mocks.verify.mockResolvedValue({ city: 'Joaçaba', state: 'SC', country: 'Brasil', expiresAt: '2026-10-26T12:05:00.000Z' });
    expect((await POST(request({ searchId: 'search-1', ready: true, locationToken: 'token' }))).status).toBe(422);
    mocks.configured.mockReturnValue(false);
    expect((await POST(request({ searchId: 'search-1', ready: true, locationToken: 'token' }))).status).toBe(503);
  });

  it('lets users unset ready without collecting location', async () => {
    mocks.configured.mockReturnValue(false);
    const response = await POST(request({ searchId: 'search-1', ready: false }));
    expect(response.status).toBe(200);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.setReady).toHaveBeenCalledWith('search-1', 'partner-1', false, 'any', undefined);
  });

  it('returns an explicit reconfirmation response when persisted readiness has gone stale', async () => {
    mocks.setReady.mockResolvedValue({ blocked: 'location-expired' });
    const response = await POST(request({ searchId: 'search-1', ready: true, locationToken: 'partner-token' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('expirou') });
  });
});
