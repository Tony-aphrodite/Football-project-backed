import { assertAdult } from './age';

describe('assertAdult', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [y, m, d] = today.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

  it('accepts someone who turns 18 today', () => {
    expect(assertAdult(iso(y - 18, m, d))).toBe(iso(y - 18, m, d));
  });
  it('refuses someone who turns 18 tomorrow', () => {
    const t = new Date(Date.UTC(y - 18, m - 1, d + 1));
    expect(() => assertAdult(t.toISOString().slice(0, 10))).toThrow('maiores de 18');
  });
  it('refuses impossible dates and garbage', () => {
    expect(() => assertAdult('2001-02-30')).toThrow('inválida');
    expect(() => assertAdult('30/01/2001')).toThrow('inválida');
    expect(() => assertAdult('1850-01-01')).toThrow('inválida');
  });
});
