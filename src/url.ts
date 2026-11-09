// Anything that is not an allowed absolute URL or an allowed site path is refused (the caller renders plain text).
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point
const BAD = /[\\\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export function safeUrl(raw: string, allowed: string[], internal: (path: string) => boolean): string | null {
  if (!raw || BAD.test(raw)) return null;
  const m = SCHEME.exec(raw);
  if (m) {
    const proto = m[1].toLowerCase() + ':';
    if (!allowed.includes(proto) || raw.length === m[0].length) return null;
    if (proto[0] === 'h' && !/^https?:\/\/[^/?#]/i.test(raw)) return null;
    return raw;
  }
  return raw[0] === '/' && raw[1] !== '/' && internal(raw) ? raw : null;
}
