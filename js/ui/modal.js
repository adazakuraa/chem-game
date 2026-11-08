// ボトムシート／モーダル
let stack = [];

export function openSheet(html, { className = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `sheet-wrap ${className}`;
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><button class="sheet-close" aria-label="閉じる">✕</button><div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('open');
    stack = stack.filter((x) => x !== api);
    if (!stack.length) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 280);
    if (onClose) onClose();
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  wrap.querySelector('.sheet-close').addEventListener('click', close);
  const api = { el: wrap, body: wrap.querySelector('.sheet-body'), close };
  stack.push(api);
  return api;
}

export function closeAllSheets() {
  [...stack].forEach((s) => s.close());
}

export function topSheet() {
  return stack[stack.length - 1];
}
