// 化学式の解析・分子量計算・表示整形（DOM 非依存。ブラウザと Node の両方で動く）

/**
 * 化学式を元素ごとの原子数に分解する。括弧の入れ子に対応。
 * 例: "Ca(OH)2" -> { Ca: 1, O: 2, H: 2 }
 */
export function parseFormula(formula) {
  const f = String(formula);
  let i = 0;
  const readNum = () => {
    let s = '';
    while (i < f.length && f[i] >= '0' && f[i] <= '9') s += f[i++];
    return s ? parseInt(s, 10) : 1;
  };
  const group = (depth) => {
    const counts = {};
    while (i < f.length) {
      const ch = f[i];
      if (ch === '(') {
        i++;
        const inner = group(depth + 1);
        if (f[i] !== ')') throw new Error(`括弧が閉じていません: ${f}`);
        i++;
        const n = readNum();
        for (const [el, c] of Object.entries(inner)) counts[el] = (counts[el] || 0) + c * n;
      } else if (ch === ')') {
        if (depth === 0) throw new Error(`対応しない ')' : ${f}`);
        return counts;
      } else if (ch >= 'A' && ch <= 'Z') {
        let el = ch;
        i++;
        while (i < f.length && f[i] >= 'a' && f[i] <= 'z') el += f[i++];
        const n = readNum();
        counts[el] = (counts[el] || 0) + n;
      } else {
        throw new Error(`化学式に不正な文字 '${ch}' : ${f}`);
      }
    }
    return counts;
  };
  const result = group(0);
  if (i < f.length) throw new Error(`化学式を最後まで解析できません: ${f}`);
  return result;
}

/** 原子数の辞書を加算（係数付き） */
export function addCounts(target, counts, factor = 1) {
  for (const [el, c] of Object.entries(counts)) target[el] = (target[el] || 0) + c * factor;
  return target;
}

/** モル質量 (g/mol) */
export function molarMass(formula, elements) {
  const counts = parseFormula(formula);
  let m = 0;
  for (const [el, c] of Object.entries(counts)) {
    const e = elements[el];
    if (!e) throw new Error(`未登録の元素: ${el}（${formula}）`);
    m += e.mass * c;
  }
  return m;
}

/** 組成式をヒル方式で並べた文字列（例: C2H6O） */
export function hillFormula(formula) {
  const counts = parseFormula(formula);
  const keys = Object.keys(counts);
  const order = [];
  if (counts.C) {
    order.push('C');
    if (counts.H) order.push('H');
  }
  keys.filter((k) => !order.includes(k)).sort().forEach((k) => order.push(k));
  return order.map((k) => k + (counts[k] > 1 ? counts[k] : '')).join('');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 化学式を HTML（下付き数字）に整形 */
export function formulaHTML(formula) {
  return esc(formula).replace(/(\d+)/g, '<sub>$1</sub>');
}

/** 化学式を Unicode 下付き文字に整形（SVG やテキスト用） */
export function formulaText(formula) {
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  return String(formula).replace(/\d/g, (d) => sub[+d]);
}
