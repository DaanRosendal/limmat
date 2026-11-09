// The streams on offer and the seeded chunker.
const REPLY = `## Debouncing a search box

A **debounce** waits until typing *pauses* before it runs your handler. The plan:

1. Wrap the handler in a timer.
2. Clear the timer on every keystroke.
3. Run the handler when the timer fires.

| Delay | Feels like | Good for |
|:------|:----------:|---------:|
| 100 ms | instant | autocomplete |
| 300 ms | smooth | search boxes |
| 1000 ms | laggy | autosave |

A small version in TypeScript:

\`\`\`ts
function debounce<T extends unknown[]>(fn: (...a: T) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...a: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...a), ms);
  };
}
\`\`\`

See [setTimeout on MDN](https://developer.mozilla.org/en-US/docs/Web/API/setTimeout).

Before you ship:

- [x] Pick a delay
- [ ] Cancel on unmount
`;

// Keys match the stream radio values in index.html and the share links, so keep them stable.
export const STREAMS = {
  reply: { label: 'Reply', text: REPLY },
  'mid-marker': { label: 'Marker', chunks: ['Hi **bo', 'ld** there, and `co', 'de` too, plus [a li', 'nk](https://exa', 'mple.com/a).'] },
  table: { label: 'Table', chunks: ['| a | b |\n', '|---|---|\n', '| 1 | 2 |\n', '| 3 | 4 |\n'] },
  fence: { label: 'Fence', chunks: ['``', '`ts\nlet a = 1;\n', '``', '`\ndone'] },
  'link-split': { label: 'Link', chunks: ['See [the pa', 'per](https://exa', 'mple.com/a) now.'] },
  list: { label: 'List', chunks: ['- a\n', '  - b\n', '    - c\n', '  - d\n'] },
  custom: { label: 'Yours', text: '' },
};
export const textOf = (st) => (st.chunks ? st.chunks.join('') : st.text);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split into chunks of whole code points: fixed size, or random lengths from 1 to size, from a seed. */
export function chunkText(text, size, random, seed) {
  const cps = Array.from(text);
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < cps.length; ) {
    const n = random ? 1 + Math.floor(rnd() * size) : size;
    out.push(cps.slice(i, i + n).join(''));
    i += n;
  }
  return out;
}
