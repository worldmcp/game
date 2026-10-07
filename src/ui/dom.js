// Tiny safe-HTML helpers. Every interpolated value is escaped unless it is
// explicitly wrapped in raw(), so player names, messages and business data
// from other users can't inject markup.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return raw(out);
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function money(n, symbol = '$') {
  return `${n < 0 ? '−' : ''}${symbol}${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(1, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export const PRESENCE_COLORS = {
  Online: '#36d399', Away: '#ffd166', Busy: '#ff5c5c', Working: '#7c9cff', Shopping: '#ff8a5b', Playing: '#e879f9',
  Learning: '#5eead4', 'Available for Work': '#36d399', Hiring: '#b794ff', 'In Conversation': '#5ce1e6', 'At Event': '#ff5ce1', Invisible: '#6b7280', Offline: '#6b7280',
};
