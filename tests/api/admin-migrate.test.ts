import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runAutoMigrations: vi.fn(),
  currentAdminSession: vi.fn(),
}));

vi.mock('@/lib/db/migrate', () => ({
  runAutoMigrations: mocks.runAutoMigrations,
}));

vi.mock('@/lib/auth', () => ({
  currentAdminSession: mocks.currentAdminSession,
}));

import { GET, POST } from '@/app/api/admin/migrate/route';

describe('POST /api/admin/migrate', () => {
  beforeEach(() => {
    mocks.runAutoMigrations.mockReset();
    mocks.currentAdminSession.mockReset();
  });

  it('GET returns 405 and never runs migrations', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(mocks.runAutoMigrations).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated POST before invoking migrations', async () => {
    mocks.currentAdminSession.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Não autorizado');
    expect(mocks.runAutoMigrations).not.toHaveBeenCalled();
  });

  it('rejects non-admin sessions before invoking migrations', async () => {
    mocks.currentAdminSession.mockResolvedValue({ id: 'player-1', role: 'player' });

    const res = await POST();
    expect(res.status).toBe(401);
    expect(mocks.runAutoMigrations).not.toHaveBeenCalled();
  });

  it('runs migrations only for an authenticated admin', async () => {
    mocks.currentAdminSession.mockResolvedValue({ id: 'admin', role: 'admin' });
    mocks.runAutoMigrations.mockResolvedValue(true);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mocks.runAutoMigrations).toHaveBeenCalledTimes(1);
  });

  it('reports migration failure to an authenticated admin', async () => {
    mocks.currentAdminSession.mockResolvedValue({ id: 'admin', role: 'admin' });
    mocks.runAutoMigrations.mockResolvedValue(false);

    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
