/** CSS.supports('gap') cannot distinguish grid gap from unsupported flex gap. */
export function applyBrowserCompatibility() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;padding:0;border:0;';
  for (let i = 0; i < 2; i++) {
    const child = document.createElement('div');
    child.style.cssText = 'height:1px;min-height:1px;margin:0;padding:0;border:0;';
    probe.appendChild(child);
  }
  document.body.appendChild(probe);
  document.documentElement.classList.toggle('no-flex-gap', probe.scrollHeight !== 3);
  probe.remove();
}
