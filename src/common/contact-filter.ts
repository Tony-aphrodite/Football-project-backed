/**
 * Hides contact details in text written by users (comments, listing
 * descriptions) so deals stay inside the app, where the payment is protected
 * and Arena earns its commission.
 *
 * The text is kept and only the contact part is replaced, so a genuine
 * question stays readable. No filter catches everything — someone can spell a
 * number out in words — so this removes the easy cases and the report button
 * covers the rest.
 *
 * Careful with false positives: prices (R$ 199,90), seasons (2023/24), sizes
 * and shirt numbers must survive untouched, which is why only runs of eight or
 * more digits count as a phone number.
 */

export const MASK = '•••';

/** Social networks and messengers people jump to when one is filtered. */
const CONTACT_WORDS = [
  'instagram', 'insta', 'ig',
  'whatsapp', 'whats', 'wpp', 'zap', 'zapzap',
  'telegram', 'facebook', 'face', 'messenger',
  'tiktok', 'twitter',
];

const RULES: RegExp[] = [
  // E-mail addresses.
  /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi,
  // Links, with or without protocol: wa.me/…, t.me/…, instagram.com/…
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b[\w-]+\.(?:com|net|me|br|app|link|bio|io)(?:\.[a-z]{2})?(?:\/\S*)?\b/gi,
  // @handles.
  /(^|[^\w@])@[\w.]{2,}/gi,
  // Phone numbers: eight or more digits, allowing spaces, dots, dashes,
  // brackets and a leading +55 — "(11) 9 5299-1340", "11995299134", "+55 11…".
  /(?:\+?\d[\s().-]{0,3}){8,}\d/g,
  // The words themselves, including l3tter sw4ps and i.n.s.t.a spacing.
  new RegExp(`\\b(?:${CONTACT_WORDS.join('|')})\\b`, 'gi'),
  new RegExp(`\\b(?:${CONTACT_WORDS.map((w) => w.split('').join('[\\s.*_-]?')).join('|')})\\b`, 'gi'),
];

export interface FilteredText {
  text: string;
  /** True when something was hidden, so the writer can be told why. */
  masked: boolean;
}

/** Replaces contact details with {@link MASK}. Safe on undefined input. */
export function maskContacts(input: string | undefined): FilteredText {
  if (!input) return { text: input ?? '', masked: false };

  let text = input;
  for (const rule of RULES) {
    text = text.replace(rule, (match, prefix?: string) => {
      // The @handle rule keeps the character before the @ (a space or nothing).
      const keep = typeof prefix === 'string' ? prefix : '';
      return `${keep}${MASK}`;
    });
  }

  // Collapse "••• •••" runs so a masked phone number does not become a wall.
  text = text.replace(new RegExp(`(?:${MASK}[\\s,.-]*){2,}`, 'g'), `${MASK} `).trim();

  return { text, masked: text !== input };
}

/** Message shown to whoever wrote the hidden contact. */
export const CONTACT_HIDDEN_NOTICE =
  'Para sua segurança, contatos externos (redes sociais, telefone, e-mail) não são permitidos. Negocie sempre pelo app.';
