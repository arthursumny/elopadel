import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  active: vi.fn(),
  invitations: vi.fn(),
  configured: vi.fn(),
  verify: vi.fn(),
  activeClub: vi.fn(),
  friendlyLocation: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ currentUserId: mocks.currentUserId }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/matchmaking', () => ({ createMatchSearch: mocks.create, cancelMatchSearch: mocks.cancel }));
vi.mock('@/lib/db/queries', () => ({ loadActiveMatchSearch: mocks.active, loadPendingMatchSearchInvitations: mocks.invitations }));
vi.mock('@/lib/location', () => ({
  isGeoapifyConfigured: mocks.configured,
  verifyLocationToken: mocks.verify,
  isActiveClubAtLocation: mocks.activeClub,
  resolveFriendlyLocation: mocks.friendlyLocation,
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/matchmaking/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function input(overrides: Record<string, unknown> = {}) {
  return { partyType: 'solo', mode: 'ranked', dates: [new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)], from: '18:00', to: '21:00', city: 'Chapecó', locationToken: 'location-token', ...overrides };
}

describe('POST /api/matchmaking/search location rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue('user-1');
    mocks.create.mockResolvedValue({ searchId: 'search-1', matched: false });
    mocks.active.mockResolvedValue(null);
    mocks.invitations.mockResolvedValue([]);
    mocks.configured.mockReturnValue(true);
    mocks.verify.mockResolvedValue({ city: 'Joaçaba', state: 'SC', country: 'Brasil', expiresAt: '2026-10-26T12:05:00.000Z' });
    mocks.activeClub.mockResolvedValue(true);
    mocks.friendlyLocation.mockResolvedValue({ city: 'Joaçaba', state: 'SC', country: 'Brasil' });
  });

  it('ignores a client-supplied ranked city and uses the user-bound canonical token location', async () => {
    const response = await POST(request(input({ clubId: '00000000-0000-4000-8000-000000000001' })));
    expect(response.status).toBe(201);
    expect(mocks.verify).toHaveBeenCalledWith('location-token', 'user-1');
    expect(mocks.activeClub).toHaveBeenCalledWith({ city: 'Joaçaba', state: 'SC', country: 'Brasil', expiresAt: '2026-10-26T12:05:00.000Z' }, '00000000-0000-4000-8000-000000000001');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ city: 'Joaçaba', state: 'SC', country: 'Brasil' }));
    expect(mocks.create.mock.calls[0]![0].city).not.toBe('Chapecó');
  });

  it('blocks ranked searches when Geoapify is unconfigured or the token is invalid', async () => {
    mocks.configured.mockReturnValue(false);
    expect((await POST(request(input()))).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.configured.mockReturnValue(true);
    mocks.verify.mockResolvedValue(null);
    expect((await POST(request(input()))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive or out-of-location club before persisting a ranked search', async () => {
    mocks.activeClub.mockResolvedValue(false);
    const response = await POST(request(input({ clubId: '00000000-0000-4000-8000-000000000001' })));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('canonicalizes friendly city and UF from active clubs too', async () => {
    const response = await POST(request(input({ mode: 'friendly', city: 'joacaba', locationToken: undefined })));
    expect(response.status).toBe(201);
    expect(mocks.friendlyLocation).toHaveBeenCalledWith('joacaba', undefined);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'friendly', city: 'Joaçaba', state: 'SC', country: 'Brasil' }));
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('rejects invalid club identifiers without reaching the database', async () => {
    const response = await POST(request(input({ clubId: 'club-joacaba' })));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
