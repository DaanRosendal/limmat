// The security oracle: lists everything in a rendered DOM that limmat must never produce. Empty means safe.
// Self-contained (no imports and no outer variables), because the browser tests serialize this function into the page.
export function audit(root: Element): string[] {
  const TAGS =
    'P H1 H2 H3 H4 H5 H6 HR BLOCKQUOTE UL OL LI DIV SPAN BUTTON PRE CODE TABLE THEAD TBODY TR TH TD A EM STRONG DEL BR INPUT IMG B I U S INS MARK SMALL KBD SUB SUP DETAILS SUMMARY'.split(
      ' ',
    );
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
    'alt',
    'src',
    'loading',
    'decoding',
    'referrerpolicy',
    'open',
  ];
  const SAFE_HREF = /^(https?:\/\/[^/?#\s]|mailto:[^\s]|\/(?![/\\]))/i;
  const SAFE_SRC = /^(https?:\/\/[^/?#\s]|\/(?![/\\]))/i;
  const bad: string[] = [];
  for (const e of Array.from(root.querySelectorAll('*'))) {
    const tag = e.tagName;
    if (!TAGS.includes(tag)) bad.push(`tag ${tag}`);
    if (tag === 'INPUT' && e.getAttribute('type') !== 'checkbox') bad.push('input type');
    if (tag === 'BUTTON' && e.getAttribute('type') !== 'button') bad.push('button type');
    if (tag === 'IMG' && e.getAttribute('referrerpolicy') !== 'no-referrer') bad.push('img referrerpolicy');
    if (tag === 'DETAILS' && !['DIV', 'BLOCKQUOTE', 'LI', 'DETAILS'].includes(e.parentElement?.tagName ?? '')) bad.push('details parent');
    if (tag === 'SUMMARY' && (e.parentElement?.tagName !== 'DETAILS' || e.parentElement.firstElementChild !== e))
      bad.push('summary position');
    if (tag === 'SUMMARY' && e.querySelector('p,ul,ol,li,blockquote,pre,table,details,button,input,div,h1,h2,h3,h4,h5,h6,hr'))
      bad.push('block inside summary');
    for (const a of Array.from(e.attributes)) {
      if (!ATTRS.includes(a.name)) bad.push(`attr ${a.name}`);
      if (a.name.startsWith('on')) bad.push(`handler ${a.name}`);
      if (a.name === 'href' && (tag !== 'A' || !SAFE_HREF.test(a.value))) bad.push(`href ${a.value}`);
      if (a.name === 'src' && (tag !== 'IMG' || !SAFE_SRC.test(a.value))) bad.push(`src ${a.value}`);
      if (a.name === 'open' && (tag !== 'DETAILS' || a.value !== '')) bad.push(`open on ${tag}`);
      if (a.name === 'style' && !(['TH', 'TD'].includes(tag) && /^text-align: ?(left|center|right);?$/.test(a.value)))
        bad.push(`style ${a.value}`);
      if (a.name === 'class' && /[\s"'<>]/.test(a.value.replace(/ /g, ''))) bad.push('class chars');
    }
    if (
      tag === 'A' &&
      /^https?:/i.test(e.getAttribute('href') ?? '') &&
      (e.getAttribute('target') !== '_blank' || e.getAttribute('rel') !== 'noopener noreferrer')
    )
      bad.push('external link rel');
  }
  return bad;
}
