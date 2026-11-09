// Self-contained (no imports), because Playwright serializes this function into the page.
export function audit(root: Element): string[] {
  const TAGS =
    'P H1 H2 H3 H4 H5 H6 HR BLOCKQUOTE UL OL LI DIV SPAN BUTTON PRE CODE TABLE THEAD TBODY TR TH TD A EM STRONG DEL BR INPUT'.split(' ');
  const ATTRS = [
    'class',
    'href',
    'target',
    'rel',
    'tabindex',
    'role',
    'aria-label',
    'aria-hidden',
    'type',
    'disabled',
    'checked',
    'start',
    'style',
  ];
  const SAFE = /^(https?:\/\/[^/?#\s]|mailto:[^\s]|\/(?![/\\]))/i;
  const bad: string[] = [];
  for (const e of Array.from(root.querySelectorAll('*'))) {
    if (!TAGS.includes(e.tagName)) bad.push('tag ' + e.tagName);
    for (const a of Array.from(e.attributes)) {
      if (!ATTRS.includes(a.name)) bad.push('attr ' + a.name);
      if (a.name === 'href' && (e.tagName !== 'A' || !SAFE.test(a.value))) bad.push('href ' + a.value);
      if (a.name === 'style' && !(['TH', 'TD'].includes(e.tagName) && /^text-align: ?(left|center|right);?$/.test(a.value)))
        bad.push('style ' + a.value);
    }
  }
  return bad;
}
