// The CommonMark normaliser, applied to every library alike. It runs inside the page.
//
// Lenient metric: the output and the spec's expected HTML are both reduced to tag structure plus
// whitespace-collapsed text. Attributes are ignored, so `href`, `class`, `id` and `data-*` never matter.
// A library passes an example when both reductions are equal.
//
// Every rule that exists only for one library is marked LIBRARY-SPECIFIC below, so a reader can judge it.

export function makeCanon() {
  // Elements that carry no document content in any library: icons and injected styles or scripts.
  const DROP = new Set(['svg', 'style', 'script', 'path']);
  // Layout wrappers. Their children are kept, the wrapper itself does not count as structure.
  const UNWRAP = new Set(['div', 'span', 'section']);
  const BLOCK = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'pre',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
    'br',
    'details',
    'summary',
  ]);

  // The structural form: "<p>text<em>x</em></p>" with whitespace collapsed.
  function canon(root) {
    const out = [];
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          out.push({ t: c.nodeValue });
          continue;
        }
        if (c.nodeType !== 1) continue;
        let tag = c.localName;
        if (DROP.has(tag)) continue;
        const ds = c.getAttribute('data-streamdown');
        // LIBRARY-SPECIFIC (streamdown): links are <button data-streamdown="link"> (a click opens a safety dialog), so they count as <a>.
        // Its other buttons (copy, download) are interface chrome and are dropped.
        if (tag === 'button') {
          if (ds === 'link') tag = 'a';
          else continue;
        }
        // LIBRARY-SPECIFIC (streamdown): inline formatting is a <span data-streamdown="..."> instead of strong, em and del.
        if (ds === 'strong') tag = 'strong';
        else if (ds === 'emphasis' || ds === 'em') tag = 'em';
        else if (ds === 'strikethrough' || ds === 'del') tag = 'del';
        if (UNWRAP.has(tag)) {
          out.push({ t: ' ' });
          walk(c);
          out.push({ t: ' ' });
          continue;
        }
        out.push({ open: tag });
        walk(c);
        out.push({ close: tag });
      }
    })(root);
    let s = '';
    let pending = '';
    for (const x of out) {
      if (x.t !== undefined) {
        pending += x.t;
        continue;
      }
      const tag = x.open ?? x.close;
      const text = pending.replace(/\s+/g, ' ');
      pending = '';
      s += (BLOCK.has(tag) ? text.trim() : text) + (x.open ? `<${tag}>` : `</${tag}>`);
    }
    s += pending.replace(/\s+/g, ' ').trim();
    return s
      .replace(/\s+/g, ' ')
      .replace(/ ?(<\/?(?:p|h[1-6]|ul|ol|li|pre|blockquote|table|thead|tbody|tr|th|td|hr|br|details|summary)>) ?/g, '$1')
      .replace(/ (<\/code>)/g, '$1')
      .replace(/(<code>) /g, '$1')
      .trim();
  }

  // The visible text only, with all whitespace removed. The weakest metric.
  function textOnly(root) {
    const walk = (n) => {
      let o = '';
      for (const c of n.childNodes) {
        if (c.nodeType === 3) o += c.nodeValue;
        else if (c.nodeType === 1) {
          if (DROP.has(c.localName)) continue;
          // LIBRARY-SPECIFIC (streamdown): keep link text, drop the text of its copy and download buttons.
          if (c.localName === 'button' && c.getAttribute('data-streamdown') !== 'link') continue;
          o += ` ${walk(c)} `;
        }
      }
      return o;
    };
    return walk(root).replace(/\s+/g, '');
  }

  // LIBRARY-SPECIFIC (streamdown and limmat): a code block may come wrapped in header and toolbar divs.
  // Replace such a wrapper by the bare <pre>, so only the code itself is compared.
  function stripChrome(root) {
    const clone = root.cloneNode(true);
    for (const pre of [...clone.querySelectorAll('pre')]) {
      let w = pre;
      while (
        w.parentElement &&
        w.parentElement !== clone &&
        w.parentElement.localName === 'div' &&
        w.parentElement.querySelectorAll('pre').length === 1 &&
        !w.parentElement.querySelector('p,h1,h2,h3,h4,h5,h6,li,table,blockquote')
      ) {
        w = w.parentElement;
      }
      if (w !== pre) w.replaceWith(pre);
    }
    return clone;
  }

  // The strict metric: serialised HTML with whitespace between tags removed, no library-specific rule at all.
  const strictHtml = (el) => el.innerHTML.replace(/>\s+</g, '><').trim();

  return { canon, textOnly, stripChrome, strictHtml };
}
