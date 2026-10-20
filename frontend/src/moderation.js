// Client-side text moderation. The backend runs the same kind of check on save.
const WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'pussy', 'slut', 'whore', 'nigger', 'nigga',
  'faggot', 'retard', 'twat', 'wanker', 'bollocks', 'porn', 'puta', 'muie', 'cacat', 'merde', 'scheisse', 'piss',
];
const EXACT = new Set(['fut', 'dick', 'cock', 'cunt', 'damn', 'rape', 'pula', 'nazi']);

const collapse = (s) => s.replace(/(.)\1+/g, '$1');

export function normalize(input) {
  return input
    .toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's');
}

export function containsProfanity(text) {
  if (!text || !text.trim()) return false;
  const tokens = normalize(text).split(/[^a-z]+/).filter(Boolean);
  for (const t of tokens) {
    const c = collapse(t);
    for (const w of WORDS) if (t.includes(w) || c.includes(collapse(w))) return true;
    for (const w of EXACT) if (t === w || c === collapse(w)) return true;
  }
  return false;
}
