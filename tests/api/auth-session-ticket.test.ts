import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/auth/session-ticket/route';

describe('Session ticket exchange (descontinuado)', () => {
  it('GET returns 410 and never publishes ticket data', async () => {
    const res = await GET();
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.code).toBe('GONE');
    expect(data.ticket).toBeUndefined();
    expect(data.token).toBeUndefined();
    expect(data.onboardingToken).toBeUndefined();
  });

  it('POST returns 410 and never returns tokens', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.code).toBe('GONE');
    expect(data.token).toBeUndefined();
    expect(data.onboardingToken).toBeUndefined();
  });
});
