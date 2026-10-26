import { describe, expect, it } from 'vitest';
import { resolveAppRedirect } from './auth-redirect';

describe('resolveAppRedirect', () => {
  it('allows the production app callback', () => {
    expect(resolveAppRedirect('elopadel://auth-callback')).toBe('elopadel://auth-callback');
    expect(resolveAppRedirect('elopadel:///auth-callback')).toBe('elopadel:///auth-callback');
  });

  it('allows Expo Go callbacks only on local development hosts', () => {
    expect(resolveAppRedirect('exp://192.168.1.11:8081/--/auth-callback')).toBe(
      'exp://192.168.1.11:8081/--/auth-callback'
    );
    expect(resolveAppRedirect('exp://localhost:8081/--/auth-callback')).toBe(
      'exp://localhost:8081/--/auth-callback'
    );
    expect(resolveAppRedirect('exp://tunnel.exp.direct/--/auth-callback')).toBeNull();
  });

  it('never sends a session token to http(s), including same-origin paths', () => {
    expect(resolveAppRedirect('https://app.elopadel.com/login')).toBeNull();
    expect(resolveAppRedirect('/login')).toBeNull();
    expect(resolveAppRedirect('//evil.example/login')).toBeNull();
    expect(resolveAppRedirect('https://evil.example/auth-callback')).toBeNull();
  });

  it('rejects other app routes, protocols and credential smuggling', () => {
    expect(resolveAppRedirect('elopadel://other-route')).toBeNull();
    expect(resolveAppRedirect('elopadel://auth-callback/extra')).toBeNull();
    expect(resolveAppRedirect('elopadel://user:pass@auth-callback')).toBeNull();
    expect(resolveAppRedirect('javascript:alert(1)')).toBeNull();
    expect(resolveAppRedirect('exp://192.168.1.11:8081/--/other')).toBeNull();
    expect(resolveAppRedirect(null)).toBeNull();
  });
});
