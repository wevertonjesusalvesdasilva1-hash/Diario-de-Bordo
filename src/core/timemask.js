// Time fields (INÍCIO / FIM): digits only, the colon is always there. Typing 1,1,1,1 gives 11:11; 9,3,0 gives 9:30
// and becomes 09:30 when the person leaves the field. Pure functions (the DOM is wired in main.js).
export const isTimeField = (f) => /^(ini|fim)[123]?$/.test(f ?? '');

// the digits split into hour and minutes: 3–9 can only start a one-digit hour; 2 followed by 4–9 too (24 is not an hour)
function split(d) {
  if (!d) return ['', ''];
  const h = d[0] > '2' || (d[0] === '2' && d.length > 1 && d[1] > '3') ? d[0] : d.slice(0, 2);
  return [h, d.slice(h.length, h.length + 2)];
}
const digitsOf = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 4);

// while typing. When the hour is complete the colon appears by itself (but not while the person is erasing).
export function maskTime(v, { deleting = false } = {}) {
  const [h, m] = split(digitsOf(v));
  if (!h) return '';
  if (m) return `${h}:${m}`;
  const complete = h.length === 2 || h > '2';
  return complete && !deleting ? `${h}:` : h;
}

// when leaving the field: always HH:MM (a missing minute becomes 00; one minute digit is the unit: 9:3 → 09:03)
export function finishTime(v) {
  const [h, m] = split(digitsOf(v));
  if (!h) return '';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

// hour 00–23 and minutes 00–59
export const timeProblem = (v) => {
  const m = /^(\d{2}):(\d{2})$/.exec(v ?? '');
  return m && +m[1] <= 23 && +m[2] <= 59 ? null : (v ? 'hora inválida' : null);
};
