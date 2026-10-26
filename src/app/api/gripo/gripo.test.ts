import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getAvailability } from './availability/route';

describe('Gripo Availability API Route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries availability for default club and returns 200', async () => {
    const mockAvailability = {
      date: '2026-10-11',
      courts: [{ id: 1, name: 'Quadra 1', hours: [] }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAvailability,
    } as Response);

    const request = new Request('http://localhost:3000/api/gripo/availability?clubId=31&date=2026-10-11');
    const response = await getAvailability(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.courts).toHaveLength(1);
    expect(data.courts[0].name).toBe('Quadra 1');
  });

  it('handles errors from Gripo API gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Error from gripo',
    } as Response);

    const request = new Request('http://localhost:3000/api/gripo/availability?clubId=31');
    const response = await getAvailability(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
