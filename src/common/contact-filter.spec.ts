import { maskContacts, MASK } from './contact-filter';

describe('maskContacts', () => {
  describe('hides contact details', () => {
    const contacts = [
      'me chama no instagram',
      'meu insta é @arena.mantos',
      'chama no IG',
      'manda no whats',
      'me chama no zap',
      'wpp 11995299134',
      'telegram: @eduardo',
      'meu email eduardo.cruz@avance-labs.com',
      'fala comigo: (11) 9 5299-1340',
      'liga 11 99529-9134',
      '+55 11 95299 1340',
      'wa.me/5511995299134',
      'segue instagram.com/arenadosmantos',
      'https://t.me/arena',
      'i.n.s.t.a arena',
      'meu i-n-s-t-a',
    ];

    it.each(contacts)('masks %p', (input) => {
      const { text, masked } = maskContacts(input);
      expect(masked).toBe(true);
      expect(text).toContain(MASK);
      // Nothing dialable or clickable survives.
      expect(text.replace(/\D/g, '')).not.toMatch(/\d{8}/);
      expect(text).not.toMatch(/@[\w.]{2,}/);
    });
  });

  describe('leaves normal jersey talk alone', () => {
    const fine = [
      'Essa camisa é tamanho M?',
      'Aceita R$ 199,90?',
      'Temporada 2023/24, modelo away',
      'A camisa do Palmeiras 10 do Rony',
      'Comprei por 150 reais na loja oficial',
      'CA 06311 na etiqueta, é original',
      'Mede 52 cm de largura e 70 de altura',
      'Tem a de 2024 na cor verde?',
    ];

    it.each(fine)('keeps %p unchanged', (input) => {
      const { text, masked } = maskContacts(input);
      expect(text).toBe(input);
      expect(masked).toBe(false);
    });
  });

  it('keeps the rest of the sentence readable', () => {
    const { text } = maskContacts('Boa camisa! Me chama no whats 11995299134 pra fechar');
    expect(text).toContain('Boa camisa!');
    expect(text).toContain('pra fechar');
  });

  it('handles empty input', () => {
    expect(maskContacts(undefined)).toEqual({ text: '', masked: false });
    expect(maskContacts('')).toEqual({ text: '', masked: false });
  });
});
