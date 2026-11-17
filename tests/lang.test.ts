import { describe, expect, it } from 'vitest';
import { detectLang } from '../src/lib/lang';

describe('detectLang', () => {
  it('reads Devanagari as Hindi', () => {
    expect(detectLang('बाथरूम साफ करो')).toBe('hi');
    expect(detectLang('Bathroom: शीशा साफ करें')).toBe('hi');
  });
  it('reads Latin text as English', () => {
    expect(detectLang('Clean the bathroom mirror')).toBe('en');
    expect(detectLang('')).toBe('en');
  });
});
