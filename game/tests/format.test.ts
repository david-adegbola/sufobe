import { describe, expect, it } from 'vitest';
import { co2, num, setFormatLang } from '../src/app/format';
import { CO2_PER_C } from '../src/core/forest';

// Intl writes Finnish thousands with a no-break space and decimals with a comma
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('number and CO₂ formatting', () => {
  it('follows the player\'s language', () => {
    expect(plain(num(12345.67, 1, 'fi'))).toBe('12 345,7');
    expect(num(12345.67, 1, 'en')).toBe('12,345.7');
    setFormatLang('en');
    expect(num(1500)).toBe('1,500');
    setFormatLang('fi');
    expect(plain(num(1500))).toBe('1 500');
  });

  it('picks g, kg or t so every amount of CO₂ reads the same way', () => {
    expect(co2(850, 'en')).toBe('850 g');
    expect(co2(4210, 'en')).toBe('4.2 kg');
    expect(co2(42_100, 'en')).toBe('42 kg');
    expect(co2(1_340_000, 'en')).toBe('1.3 t');
    expect(plain(co2(1_340_000, 'fi'))).toBe('1,3 t');
  });

  it('uses one carbon-to-CO₂ factor for both games', () => {
    expect(CO2_PER_C).toBeCloseTo(3.667, 3);
  });
});
