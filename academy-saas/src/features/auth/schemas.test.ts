import { describe, expect, it } from 'vitest';
import { safeNext, newPasswordSchema } from './schemas';

describe('safeNext (open-redirect protection)', () => {
  it('keeps internal paths', () => { expect(safeNext('/players/p3')).toBe('/players/p3'); });
  it('rejects other sites and tricks', () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/players?x=//evil', '', null, undefined]) {
      expect(safeNext(bad)).toBe('/dashboard');
    }
  });
});

describe('password rules', () => {
  it('requires 10+ characters and matching confirmation', () => {
    expect(newPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: 'long enough pass', confirm: 'different pass!' }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: 'long enough pass', confirm: 'long enough pass' }).success).toBe(true);
  });
});
