import { describe, expect, it } from 'vitest';
import {
  canSubmitHandle,
  handleAvailabilityMessage,
  isStaleHandleResponse,
  shouldLookupHandle,
  type HandleAvailabilityState,
} from './handle-availability-ui';

const state = (status: HandleAvailabilityState['status'], handle = 'marina', message?: string): HandleAvailabilityState => ({ status, handle, message });

describe('handle availability UI state', () => {
  it('only looks up complete, non-reserved public handles', () => {
    expect(shouldLookupHandle('')).toBe(false);
    expect(shouldLookupHandle('ab')).toBe(false);
    expect(shouldLookupHandle('admin')).toBe(false);
    expect(shouldLookupHandle('marina')).toBe(true);
    expect(shouldLookupHandle('@marina')).toBe(true);
  });

  it('only allows submit for the current handle and a resolved available response', () => {
    expect(canSubmitHandle(state('available'), 'marina')).toBe(true);
    expect(canSubmitHandle(state('available', 'outra'), 'marina')).toBe(false);
    expect(canSubmitHandle(state('checking'), 'marina')).toBe(false);
    expect(canSubmitHandle(state('idle'), 'marina')).toBe(false);
    expect(canSubmitHandle(state('taken'), 'marina')).toBe(false);
    expect(canSubmitHandle(state('invalid'), 'marina')).toBe(false);
  });

  it('treats a stale response as pending and blocks submit', () => {
    const pendingForOldHandle = state('available', 'marina');
    expect(canSubmitHandle(pendingForOldHandle, 'marina2')).toBe(false);
  });

  it('allows submit after a network error, because the server makes the final check', () => {
    expect(canSubmitHandle(state('error'), 'marina')).toBe(true);
    expect(canSubmitHandle(state('error'), 'marina', { allowNetworkError: false })).toBe(false);
  });

  it('provides accessible messages for each state', () => {
    expect(handleAvailabilityMessage(state('checking'))).toContain('Verificando');
    expect(handleAvailabilityMessage(state('available'))).toBe('Arroba disponível.');
    expect(handleAvailabilityMessage(state('taken'))).toContain('já está em uso');
    expect(handleAvailabilityMessage(state('invalid'))).toContain('válida');
    expect(handleAvailabilityMessage(state('error'))).toContain('servidor confirma');
    expect(handleAvailabilityMessage(state('idle'))).toBe('');
  });

  it('detects stale responses by handle and request order', () => {
    expect(isStaleHandleResponse('@marina', '@marina', 3, 3)).toBe(false);
    expect(isStaleHandleResponse('@outra', '@marina', 3, 3)).toBe(true);
    expect(isStaleHandleResponse('@marina', '@marina', 2, 3)).toBe(true);
  });
});
