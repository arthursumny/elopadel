import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ currentClubId: vi.fn(), db: null as unknown, notifyUsers: vi.fn() }));
vi.mock('@/lib/auth', () => ({ currentClubId: mocks.currentClubId }));
vi.mock('@/lib/db', () => ({ get db() { return mocks.db; } }));
vi.mock('@/lib/db/notifications', () => ({ notifyUsers: mocks.notifyUsers }));

import { POST } from './route';

describe('club membership decision races', () => {
  it('returns 404 when a membership disappears after the user lock is acquired', async () => {
    mocks.currentClubId.mockResolvedValue('club-id');
    const membershipQuery = (rows: unknown[]) => ({
      from: () => ({ where: () => ({ limit: async () => rows }) }),
    });
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => membershipQuery([])),
      update: vi.fn(),
    };
    mocks.db = {
      select: () => membershipQuery([{ id: 'membership-id', userId: 'user-id' }]),
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    };

    const response = await POST(
      new Request('http://localhost/api/club/memberships/membership-id/decision', { method: 'POST', body: JSON.stringify({ decision: 'approved' }) }),
      { params: Promise.resolve({ id: 'membership-id' }) },
    );

    expect(response.status).toBe(404);
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});
