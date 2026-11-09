// Anything that is not an allowed absolute URL or an allowed site path is refused (the caller renders plain text).
// Also refused: backslash, no-break and soft-hyphen spaces, bidi controls, and other invisible or look-alike separators.
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point
const BAD = /[\\\u0000-\u0020\u007f-\u00a0\u00ad\u061c\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export function safeUrl(raw: string, allowed: string[], internal: (path: string) => boolean): string | null {
  if (!raw || BAD.test(raw)) return null;
  const m = SCHEME.exec(raw);
  if (m) {
    const proto = m[1].toLowerCase() + ':';
    if (!allowed.includes(proto) || raw.length === m[0].length || /^(?:javascript|data|vbscript):$/.test(proto)) return null;
    if (proto[0] === 'h' && !/^https?:\/\/[^/?#]/i.test(raw)) return null;
    try {
      new URL(raw);
    } catch {
      return null;
    }
    return raw;
  }
  return raw[0] === '/' && raw[1] !== '/' && internal(raw) ? raw : null;
}
