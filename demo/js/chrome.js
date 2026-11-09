// Header chrome: theme toggle, the install button, and the build details of the limmat this page runs.
import { $, notice, reduceMotion } from './dom.js';

export function initTheme() {
  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const swap = () => {
      root.dataset.theme = dark ? 'light' : 'dark';
    };
    // View Transitions cross-fade the whole page where the browser has them. Elsewhere the theme just switches.
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(swap);
    else swap();
  });
}

export function initInstall() {
  const btn = $('#copy-install');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('npm install limmat');
      notice('Copied: npm install limmat');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('code', btn));
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      notice('Press Ctrl+C to copy');
    }
  });
}

export async function showRelease() {
  const chip = $('#release');
  try {
    const rel = await (await fetch('release.json')).json();
    chip.textContent = `limmat ${rel.version} · ${(rel.gzip / 1000).toFixed(1)} kB gzip`;
    chip.title = `This page runs the real build: ${rel.bytes.toLocaleString('en')} bytes, ${rel.gzip.toLocaleString('en')} bytes gzip, sha256 ${rel.sha256.slice(0, 12)}`;
  } catch {
    chip.textContent = 'limmat';
  }
}
