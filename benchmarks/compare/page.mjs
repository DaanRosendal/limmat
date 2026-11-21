// Code that runs inside the page, next to the library bundle. Injected as source text by run.mjs.

// Runs before any page script: the sentinel that payloads call instead of alert, and a window.open recorder.
export function initScript() {
  window.__fired = [];
  window.__opens = [];
  window.__navs = [];
  window.__pwn = (id) => {
    window.__fired.push(String(id));
  };
  window.open = (u) => {
    window.__opens.push(String(u));
    return null;
  };
  // A click on a link that is not a javascript: URL must not navigate the page away. A javascript: link is left alone, so it can fire.
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      let proto = '';
      try {
        proto = new URL(href, location.href).protocol;
      } catch {}
      if (proto !== 'javascript:') {
        window.__navs.push(href);
        e.preventDefault();
      }
    },
    true,
  );
}

export function makeKit() {
  const MARKERS = /[*_`~#[\]|>-]/;
  const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster', 'background', 'ping', 'cite'];

  // About 60 ms of real time plus two animation frames, after every write.
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  const protoOf = (v) => {
    if (/^\s*javascript:throw new Error\('React has blocked/i.test(v)) return 'react-blocked:';
    try {
      return new URL(v, location.href).protocol;
    } catch {
      return 'invalid:';
    }
  };

  // Adds what is in the container now to the running union `seen`.
  function scan(c, seen) {
    for (const el of c.querySelectorAll('*')) {
      const tag = el.localName;
      seen.tags.add(tag);
      for (const a of el.attributes) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || n === 'srcdoc') seen.on.add(`${tag}[${n}]`);
        if (URL_ATTRS.includes(n)) seen.urls.add(`${tag}[${n}]${protoOf(a.value)}`);
      }
    }
  }

  function anchors(c) {
    return [...c.querySelectorAll('a, button[data-streamdown="link"]')].map((a) => ({
      tag: a.localName,
      href: a.localName === 'a' ? a.href : '',
      proto: a.localName === 'a' ? a.protocol : '',
      raw: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel'),
    }));
  }

  async function clickAll(c) {
    for (const el of [...c.querySelectorAll('a, button[data-streamdown="link"]')]) {
      if (el.localName === 'a') el.removeAttribute('target');
      el.click();
      await settle();
      // Streamdown asks for a confirmation first, so press its button as well.
      for (const b of [...document.querySelectorAll('button')]) {
        if (!c.contains(b) && /open link/i.test(b.textContent || '')) {
          b.click();
          await settle();
        }
      }
    }
  }

  // Streams `text` into a fresh container, scanning after every write.
  async function runPayload(text, mode, click) {
    window.__fired.length = 0;
    window.__opens.length = 0;
    window.__navs.length = 0;
    const c = document.createElement('div');
    document.body.append(c);
    const lib = window.LIB.create(c);
    const seen = { tags: new Set(), on: new Set(), urls: new Set() };
    let leakStep = null;
    let leakCh = null;
    const steps = mode === 'whole' ? [text] : Array.from(text);
    for (let i = 0; i < steps.length; i++) {
      await lib.write(steps[i]);
      await settle();
      scan(c, seen);
      if (leakStep === null) {
        const m = MARKERS.exec(c.textContent);
        if (m) {
          leakStep = i;
          leakCh = m[0];
        }
      }
    }
    await lib.end();
    await settle();
    scan(c, seen);
    const finalText = c.textContent;
    const finalAnchors = anchors(c);
    const imgs = [...c.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    if (click) await clickAll(c);
    const rec = {
      fired: [...window.__fired],
      opens: [...window.__opens],
      navs: [...window.__navs],
      seen: { tags: [...seen.tags].sort(), on: [...seen.on].sort(), urls: [...seen.urls].sort() },
      finalText,
      finalMarker: MARKERS.test(finalText),
      leakStep,
      leakCh,
      anchors: finalAnchors,
      imgs,
    };
    lib.destroy();
    c.remove();
    await settle();
    return rec;
  }

  // The same CommonMark normaliser as canon.mjs, built from its source. `spec` is the fixture, `canonSrc` the factory text.
  async function commonmark(spec, canonSrc) {
    const { canon, textOnly, stripChrome, strictHtml } = new Function(`return (${canonSrc})()`)();
    const passed = [];
    const failed = [];
    let strict = 0;
    let text = 0;
    const crashed = [];
    for (const ex of spec) {
      const want = document.implementation.createHTMLDocument('').body;
      want.innerHTML = ex.html;
      const c = document.createElement('div');
      document.body.append(c);
      try {
        const lib = window.LIB.create(c);
        await lib.write(ex.markdown);
        await lib.end();
        await new Promise((r) => setTimeout(r, 0));
        const got = stripChrome(c);
        if (canon(got) === canon(want)) passed.push(ex.example);
        else failed.push(ex.example);
        if (textOnly(got) === textOnly(want)) text++;
        if (strictHtml(c) === strictHtml(want)) strict++;
        lib.destroy();
      } catch {
        failed.push(ex.example);
        crashed.push(ex.example);
      }
      c.remove();
    }
    return { passed: passed.length, failed, strict, textOnly: text, crashed };
  }

  return { runPayload, commonmark, settle };
}
