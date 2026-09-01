// Deterministic initials + avatar color from a name/seed, so the same person
// always gets the same look. Greens/reds are excluded to avoid clashing with
// the availability semantics elsewhere.

const PALETTE = ['indigo', 'grape', 'cyan', 'blue', 'violet', 'pink', 'teal', 'orange'];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters: string[] = [];
  for (const w of words) {
    const m = w.match(/[\p{L}\p{N}]/u);
    if (m) letters.push(m[0].toUpperCase());
    if (letters.length >= 2) break;
  }
  return letters.join('') || '?';
}

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
