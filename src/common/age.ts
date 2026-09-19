import { BadRequestException } from '@nestjs/common';

/** Minimum age to use the platform (Terms §5, Privacy Policy §14). */
export const MIN_AGE = 18;

/**
 * Validates a birth date (YYYY-MM-DD) and returns it normalised. Age is
 * counted in calendar years in São Paulo time, so someone turning 18 today
 * is accepted today, not tomorrow.
 */
export function assertAdult(birthDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  const y = m ? +m[1] : NaN, mo = m ? +m[2] : NaN, d = m ? +m[3] : NaN;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (!m || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new BadRequestException('Data de nascimento inválida.');
  }
  const [ty, tm, td] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  if (age > 120) throw new BadRequestException('Data de nascimento inválida.');
  if (age < MIN_AGE) {
    throw new BadRequestException('A Arena dos Mantos é destinada a maiores de 18 anos.');
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}
