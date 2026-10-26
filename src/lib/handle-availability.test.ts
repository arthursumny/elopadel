import { describe, expect, it, vi } from 'vitest';
import { createPlayer } from './runtime-store';

vi.mock('@/lib/db', () => ({ db: null }));

import { isPublicHandleAvailable } from './handle-availability';

describe('public handle availability fallback', () => {
  it('checks the existing runtime player directory', async () => {
    const handle = `@availability_${Date.now().toString(36)}`;
    createPlayer({
      phone: '',
      displayName: 'Fixture player',
      handle,
      city: 'Test city',
      state: 'TS',
      category: '5ª',
    });

    expect(await isPublicHandleAvailable(handle)).toBe(false);
    expect(await isPublicHandleAvailable('@available_new')).toBe(true);
  });
});
