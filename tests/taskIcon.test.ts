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
    expect(icon('Iron shirts')).toBe('👕');
    expect(icon('Iron')).toBe('🧺');
    expect(icon('Clean bathroom')).toBe('🚽');
    expect(icon('Cook dinner')).toBe('🍳');
    expect(icon('Take out the trash')).toBe('🗑️');
    expect(icon('Water the plants')).toBe('🌱');
    expect(icon('Change bedsheets')).toBe('🛏️');
    expect(icon('Clean the kitchen counter')).toBe('🍴');
    expect(icon('Wipe windows')).toBe('🪞');
  });
  it('understands Hinglish and Hindi', () => {
    expect(icon('Jhadu pocha')).toBe('🧹');
    expect(icon('Pocha')).toBe('🪣');
    expect(icon('Bartan')).toBe('🍽️');
    expect(icon('बर्तन धोना')).toBe('🍽️');
    expect(icon('झाड़ू लगाओ')).toBe('🧹');
    expect(icon('बाथरूम साफ करो')).toBe('🚽');
  });
  it('matches whole words only', () => {
    expect(icon('Put the bin out')).toBe('🗑️');
    expect(icon('Organise cabinet')).toBe('🚪');
    expect(icon('Take care of things')).toBe(DEFAULT_TASK_ICON);
  });
  it('prefers the object over the place or person', () => {
    expect(icon('Take out router from under kids wardrobe')).toBe('🛜');
    expect(icon('Move air purifier plug in children’s room')).toBe('🌬️');
    expect(icon('Wash these shoes')).toBe('👟');
    expect(icon('Change plastic')).toBe('🗑️');
    expect(icon('Change towel')).toBe('🧺');
    expect(icon('Grinder fixed')).toBe('🔌');
    expect(icon('Clean the kids room')).toBe('👶');
    expect(icon('Sweep the kitchen')).toBe('🧹');
    expect(icon('Fill water bottles')).toBe('💧');
    expect(icon('Toilet paper refill')).toBe('🧻');
    expect(icon('Charge the phone')).toBe('📱');
    expect(icon('Fill with camphor')).toBe('🪔');
    expect(icon('Fix the tap in the kitchen')).toBe('🚰');
  });
  it('falls back to the description, then a generic picture', () => {
    expect(icon('Morning job', 'Sweep the balcony')).toBe('🧹');
    expect(icon('Misc')).toBe(DEFAULT_TASK_ICON);
    expect(icon('Kitchen')).toBe('🍴');
    expect(icon('')).toBe(DEFAULT_TASK_ICON);
  });
});
