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

// A reply that a model could be tricked into writing: every payload the safety claims are about, mixed with normal text.
const HOSTILE = `Sure, here are the links you asked for:

- [one](javascript:alert(1))
- [two](java\tscript:alert(1))
- [three](java&#115;cript:alert(1))
- [four](data:text/html,<script>alert(1)</script>)
- [five](//evil.com)
- [six](/\\evil.com)

<script>alert(1)</script>

<img src=x onerror=alert(1)>

![tracker](https://evil.com/track.png)

[![logo](https://evil.com/p.png)](https://example.com)

\`\`\`a b" onclick="alert(1)
console.log(1)
\`\`\`

${'> '.repeat(40)}and that is the whole list.
`;

const MARKER = `Streaming markdown has a **hard part**: the text arrives in *pieces*, so a marker like \`**\` or a [link](url) is often cut in half.

When limmat sees a **bold** that has not closed yet, it waits. The same goes for \`code\` that is still open, or half a URL like [this one](https://example.com/docs/streaming).

Try ***bold italic***, ~~strikethrough~~, and a bare link such as https://example.com/limmat.
`;

const TABLE = `Here is a comparison of the three plans:

| Plan | Price | Seats | Support |
|:-----|------:|:-----:|:--------|
| Free | $0 | 1 | Community |
| Team | $12 | 10 | Email |
| Business | $40 | 50 | Chat |
| Enterprise | Custom | Unlimited | Dedicated |

The Team plan is the most popular.
`;

const FENCE = `Here is a small retry helper:

\`\`\`ts
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i + 1 >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2 ** i * 100));
    }
  }
}
\`\`\`

It waits 100, 200, then 400 ms between tries.
`;

const LINKS = `Some good reading:

- [MDN: Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [The CommonMark spec](https://spec.commonmark.org/0.31.2/)
- [Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

Or just visit https://example.com/docs, or write to hello@example.com.
`;

const LIST = `Packing list:

1. Documents
   - Passport
   - Tickets
2. Clothes
   - Jacket
   - Two shirts
     - One for the flight
3. Chargers
   - Phone
   - Laptop

- [x] Check in online
- [ ] Print the boarding pass
`;

// Keys match the stream radio values in index.html and the share links, so keep them stable.
export const STREAMS = {
  reply: { label: 'Reply', text: REPLY },
  'mid-marker': { label: 'Marker', text: MARKER },
  table: { label: 'Table', text: TABLE },
  fence: { label: 'Fence', text: FENCE },
  'link-split': { label: 'Link', text: LINKS },
  list: { label: 'List', text: LIST },
  hostile: { label: 'Attack', text: HOSTILE },
  custom: { label: 'Custom', text: '' },
};

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
