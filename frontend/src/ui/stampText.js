/** What the stamp prints: the exact text – or, for a hidden password, one dot per character. */
export function stampText(value, { password = false, show = false } = {}) {
  return password && !show ? '•'.repeat([...value].length) : value;
}
