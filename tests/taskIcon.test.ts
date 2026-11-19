import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_ICON, taskIcon } from '../src/lib/taskIcon';

const icon = (title: string, description = '') => taskIcon({ title, description });

describe('taskIcon', () => {
  it('picks a picture from common chore words', () => {
    expect(icon('Wash dishes')).toBe('🍽️');
    expect(icon('Sweeping the hall')).toBe('🧹');
    expect(icon('Mop floors')).toBe('🪣');
    expect(icon('Mopping')).toBe('🪣');
    expect(icon('Do the laundry')).toBe('🧺');
    expect(icon('Iron shirts')).toBe('🧺');
    expect(icon('Clean bathroom')).toBe('🚽');
    expect(icon('Cook dinner')).toBe('🍳');
    expect(icon('Take out the trash')).toBe('🗑️');
    expect(icon('Water the plants')).toBe('🌱');
    expect(icon('Change bedsheets')).toBe('🛏️');
    expect(icon('Clean the kitchen counter')).toBe('🍴');
    expect(icon('Wipe windows')).toBe('🪞');
  });
  it('understands Hinglish and Hindi', () => {
    expect(icon('Jhadu pocha')).toBe('🪣');
    expect(icon('Bartan')).toBe('🍽️');
    expect(icon('बर्तन धोना')).toBe('🍽️');
    expect(icon('झाड़ू लगाओ')).toBe('🧹');
    expect(icon('बाथरूम साफ करो')).toBe('🚽');
  });
  it('matches whole words only', () => {
    expect(icon('Organise cabinet')).toBe(DEFAULT_TASK_ICON);
    expect(icon('Take care of things')).toBe(DEFAULT_TASK_ICON);
  });
  it('falls back to the description, then a generic picture', () => {
    expect(icon('Morning job', 'Sweep the balcony')).toBe('🧹');
    expect(icon('Misc')).toBe(DEFAULT_TASK_ICON);
    expect(icon('')).toBe(DEFAULT_TASK_ICON);
  });
});
