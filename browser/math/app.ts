// The page side of browser/math.spec.ts: limmat and the limmat/katex adapter from dist/, and the real KaTeX, bundled for the page.
import katex from 'katex';
import { createRenderer } from 'limmat';
import { katexMath } from 'limmat/katex';
import temml from 'temml';

(window as unknown as { kit: unknown }).kit = { katex, temml, createRenderer, katexMath };
(window as unknown as { ready: boolean }).ready = true;
