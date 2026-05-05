import { Injectable } from '@nestjs/common';

/**
 * Brazilian CPF validation using the Receita Federal mod-11 algorithm.
 *
 * The CPF is 11 digits. The last 2 are check digits computed over the first
 * 9 (and then the first 10) using a weighted sum modulo 11. Digit sequences
 * that are all the same (00000000000, 11111111111, …) are technically valid
 * by the algorithm but issued as test/demo numbers — we reject them too.
 *
 * Reference: https://www.receita.fazenda.gov.br/aplicacoes/atcta/cpf/funcoes.js
 */
@Injectable()
export class CpfValidatorService {
  /** Returns true when `raw` is a structurally valid CPF. */
  isValid(raw: string): boolean {
    const digits = this.stripPunctuation(raw);
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    return (
      digits[9] === String(this.checkDigit(digits.slice(0, 9))) &&
      digits[10] === String(this.checkDigit(digits.slice(0, 10)))
    );
  }

  /** Removes the typical "000.000.000-00" punctuation and any other non-digit. */
  stripPunctuation(raw: string): string {
    return raw.replace(/\D+/g, '');
  }

  /**
   * Computes a single CPF check digit over an arbitrary-length numeric prefix.
   * Weights start at (length + 1) and decrement to 2.
   */
  private checkDigit(prefix: string): number {
    const len = prefix.length;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += parseInt(prefix[i], 10) * (len + 1 - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }
}
