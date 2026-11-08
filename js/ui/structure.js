// 構造式の SVG 描画
// structure.type:
//   molecule: atoms [[label, x, y]], bonds [[i, j, order]]（座標は結合長 ≈ 1 の単位）
//   ionic:    ions [[label, charge, count]]
//   metal / atom: element
import { esc } from './util.js';

const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
const SUP = { '+': '⁺', '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const subText = (s) => s.replace(/\d/g, (d) => SUB[d]);
const supText = (s) => String(s).replace(/[0-9+-]/g, (c) => SUP[c]);

/** ラベルから代表元素を決める（H 以外の最初の元素。なければ H） */
function mainElement(label) {
  const els = String(label).match(/[A-Z][a-z]?/g) || ['C'];
  return els.find((e) => e !== 'H') || els[0];
}

function colorOf(el, elements) {
  return (elements[el] && elements[el].color) || '#cbd5e1';
}

function renderMolecule(st, elements) {
  const U = 46; // 単位長あたりの px
  const xs = st.atoms.map((a) => a[1]);
  const ys = st.atoms.map((a) => a[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 30;
  const w = (maxX - minX) * U + pad * 2;
  const h = (maxY - minY) * U + pad * 2;
  const P = (a) => [(a[1] - minX) * U + pad, (a[2] - minY) * U + pad];
  const radius = (label) => 9 + Math.max(0, String(label).replace(/[⁺⁻]/g, '').length - 1) * 5;

  let bonds = '';
  for (const [i, j, order] of st.bonds) {
    const [x1, y1] = P(st.atoms[i]);
    const [x2, y2] = P(st.atoms[j]);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const r1 = radius(st.atoms[i][0]), r2 = radius(st.atoms[j][0]);
    const ax = x1 + ux * r1, ay = y1 + uy * r1;
    const bx = x2 - ux * r2, by = y2 - uy * r2;
    const nx = -uy, ny = ux;
    const offsets = order === 2 ? [-3.2, 3.2] : order === 3 ? [-5, 0, 5] : [0];
    for (const o of offsets) {
      bonds += `<line x1="${(ax + nx * o).toFixed(1)}" y1="${(ay + ny * o).toFixed(1)}" x2="${(bx + nx * o).toFixed(1)}" y2="${(by + ny * o).toFixed(1)}" class="bond"/>`;
    }
  }
  let atoms = '';
  for (const a of st.atoms) {
    const [x, y] = P(a);
    const label = String(a[0]);
    const el = mainElement(label);
    const charge = (label.match(/[⁺⁻]+$/) || [''])[0];
    const body = label.replace(/[⁺⁻]+$/, '');
    atoms += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="atom" fill="${colorOf(el, elements)}">${esc(subText(body))}${charge ? `<tspan class="charge" dy="-7">${esc(charge)}</tspan>` : ''}</text>`;
  }
  return { w, h, inner: bonds + atoms };
}

function renderIonic(st, elements) {
  const items = [];
  for (const [label, charge, n] of st.ions) for (let k = 0; k < (n || 1); k++) items.push({ label, charge });
  const gap = 12;
  const sizes = items.map((it) => (String(it.charge).includes('-') ? 30 : 24) + Math.max(0, it.label.length - 2) * 4);
  const w = sizes.reduce((t, r) => t + r * 2 + gap, gap) + 10;
  const h = 100;
  let x = gap + 5;
  let inner = '';
  items.forEach((it, idx) => {
    const r = sizes[idx];
    const cx = x + r;
    const color = colorOf(mainElement(it.label), elements);
    inner += `<circle cx="${cx}" cy="50" r="${r}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2"/>`;
    inner += `<text x="${cx}" y="54" class="ion" fill="${color}">${esc(subText(it.label))}<tspan class="charge" dy="-8">${esc(supText(it.charge))}</tspan></text>`;
    x += r * 2 + gap;
  });
  return { w, h, inner };
}

function renderLattice(el, elements) {
  const color = colorOf(el, elements);
  const r = 15;
  let inner = '';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = 22 + col * 2 * r + (row % 2 ? r : 0);
      const cy = 22 + row * r * 1.73;
      inner += `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="${r - 1}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>`;
      inner += `<text x="${cx}" y="${(cy + 4).toFixed(1)}" class="ion small" fill="${color}">${esc(el)}</text>`;
    }
  }
  return { w: 22 * 2 + 7 * r + 6, h: 22 * 2 + 2 * r * 1.73, inner };
}

function renderAtom(el, elements) {
  const color = colorOf(el, elements);
  return {
    w: 100, h: 100,
    inner: `<circle cx="50" cy="50" r="34" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/><text x="50" y="57" class="ion big" fill="${color}">${esc(el)}</text>`,
  };
}

export function renderStructure(structure, elements, { className = '' } = {}) {
  if (!structure) return '<div class="structure-missing">構造データなし</div>';
  let r;
  switch (structure.type) {
    case 'molecule': r = renderMolecule(structure, elements); break;
    case 'ionic': r = renderIonic(structure, elements); break;
    case 'metal': r = renderLattice(structure.element, elements); break;
    case 'atom': r = renderAtom(structure.element, elements); break;
    default: return '';
  }
  const caption = structure.type === 'ionic' ? 'イオンからなる物質（組成を表示）'
    : structure.type === 'metal' ? '金属結晶（模式図）'
    : structure.note || '';
  return `<figure class="structure ${className}"><svg viewBox="0 0 ${r.w.toFixed(0)} ${r.h.toFixed(0)}" role="img" aria-label="構造式">${r.inner}</svg>${caption ? `<figcaption>${esc(caption)}${structure.note && structure.type !== 'atom' ? `（${esc(structure.note)}）` : ''}</figcaption>` : ''}</figure>`;
}
