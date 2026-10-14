// Audit of the history (production + stops): every check returns { id, area, level, title, why, count, hours?, head, rows }.
// Pure functions. Nothing here changes the data: it only finds what a person should look at.
import { toMin, spanHours, dmy, standardByPieceModel, standardHours, auditDays } from './history.js';
import { aliasKey } from './lists.js';

const f1 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const segsOf = (i, f) => { const a = toMin(i), b = toMin(f); if (a == null || b == null) return []; return b >= a ? [[a, b]] : [[a, 1440], [0, b]]; };
// absolute minutes (day index × 1440 + clock): a piece that crosses midnight ends on the next day instead of wrapping onto the same one
const dayIdx = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const absSegs = (d, pairs) => pairs.flatMap(([i, f]) => { const a = toMin(i), b = toMin(f); if (a == null || b == null || (a === 0 && b === 0 && !i)) return []; const base = dayIdx(d) * 1440; return [[base + a, base + (b >= a ? b : b + 1440)]]; });
const prodSegs = (r) => absSegs(r.d, [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]]);
const stopSegs = (s) => absSegs(s.d, [[s.i, s.f]]);
// pairs of records of the same machine whose clock times overlap by more than `min` minutes
function overlaps(list, segFn, min = 5) {
  const byM = new Map(), out = [];
  for (const r of list) (byM.get(r.m) ?? byM.set(r.m, []).get(r.m)).push({ r, g: segFn(r) });
  for (const arr of byM.values()) {
    for (const x of arr) x.lo = x.g.length ? Math.min(...x.g.map((q) => q[0])) : Infinity;
    arr.sort((a, b) => a.lo - b.lo);
    for (let i = 0; i < arr.length; i++) { const end = Math.max(...arr[i].g.map((x) => x[1]), -Infinity); for (let j = i + 1; j < arr.length; j++) { if (arr[j].lo >= end) break; const m = overlapMin(arr[i].g, arr[j].g); if (m > min) out.push([arr[i].r, arr[j].r, m]); } }
  }
  return out;
}
const overlapMin = (A, B) => { let t = 0; for (const [a1, a2] of A) for (const [b1, b2] of B) t += Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)); return t; };
const level = { erro: 0, atenção: 1, info: 2 };
const keyP = (r) => ['P', r.m, r.d, r.p, r.o, r.c1, r.i1, r.f1, r.c2, r.i2, r.f2, r.c3, r.i3, r.f3].join('|');
const keyS = (r) => ['S', r.m, r.d, r.c, r.i, r.f, r.t ?? '', r.mo].join('|');
const times = (r) => [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].filter(([a, b]) => a || b).map(([a, b]) => `${a || '?'}–${b || '?'}`).join(' · ');
const prodCols = ['Dia', 'Máquina', 'Peça e modelo', 'Horários', 'Horas', 'Detalhe'];
const stopCols = ['Dia', 'Máquina', 'Chapa', 'Horário', 'Motivo', 'Horas', 'Detalhe'];
const pRow = (r, why = '') => [dmy(r.d), r.m, `${r.p}-${r.o}`, times(r), +(+r.h).toFixed(2), why];
const sRow = (s, why = '') => [dmy(s.d), s.m, s.c, `${s.i}–${s.f}`, s.mo, +(+s.h).toFixed(2), why];
const closeEnough = (a, b) => Math.abs(a - b) <= 0.0105;

// opts: { prod, stops, known?: Set<chapa> }   (known = operators list; optional)
export function auditData({ prod, stops, known = null, today = new Date().toISOString().slice(0, 10) }) {
  const out = [];
  const add = (c) => out.push({ hours: null, ...c, count: c.rows.length });

  { // dates that have not happened yet (typed with the wrong day or month)
    const rows = [...prod.filter((r) => r.d > today).map((r) => pRow(r, `data ${dmy(r.d)} ainda não chegou`)), ...stops.filter((x) => x.d > today).map((x) => sRow(x, `data ${dmy(x.d)} ainda não chegou`))];
    add({ id: 'd-future', area: 'Dia inteiro', level: 'erro', title: 'Registro com data no futuro', why: 'Provavelmente dia ou mês digitado errado: o registro some do período certo e aparece em um dia que não existe.', head: stopCols, rows });
  }
  // ---------------------------------------------------------------- production
  { // repeated identical rows
    const seen = new Map(), rows = [];
    for (const r of prod) { const k = keyP(r); seen.set(k, (seen.get(k) || 0) + 1); }
    for (const r of prod) { const n = seen.get(keyP(r)); if (n > 1) { rows.push(pRow(r, `${n} linhas iguais (mesma máquina, dia, peça, chapas e horários)`)); seen.set(keyP(r), -1); } }
    add({ id: 'p-dup', area: 'Produção', level: 'atenção', title: 'Produções repetidas', why: 'Linhas idênticas podem ser a mesma peça lançada duas vezes (soma as horas em dobro) ou duas peças iguais feitas de fato.', head: prodCols, rows });
  }
  { // times missing / invalid
    const rows = [];
    for (const r of prod) {
      for (const [i, f, n] of [[r.i1, r.f1, 1], [r.i2, r.f2, 2], [r.i3, r.f3, 3]]) {
        const c = [r.c1, r.c2, r.c3][n - 1];
        if ((i && !f) || (!i && f)) rows.push(pRow(r, `turno ${n}: só um dos horários (início ou fim) preenchido`));
        else if (c && !i && !f && Number(r.t) === n) rows.push(pRow(r, `turno ${n}: chapa ${c} sem horário`));
      }
    }
    add({ id: 'p-time', area: 'Produção', level: 'erro', title: 'Horário faltando na produção', why: 'Sem início ou fim a hora da peça não é calculada (ou fica errada).', head: prodCols, rows });
  }
  { // one row longer than 12 h / shorter than 3 min
    const long = prod.filter((r) => r.h > 12).map((r) => pRow(r, `${f1(r.h)} h numa única peça`)), tiny = prod.filter((r) => r.h > 0 && r.h < 0.05).map((r) => pRow(r, 'menos de 3 minutos'));
    add({ id: 'p-long', area: 'Produção', level: 'atenção', title: 'Peça com tempo longo demais', why: 'Mais de 12 h numa peça costuma ser horário digitado errado ou vários dias juntos.', head: prodCols, rows: long });
    add({ id: 'p-tiny', area: 'Produção', level: 'info', title: 'Peça com tempo curto demais', why: 'Menos de 3 minutos: confira se o horário está certo.', head: prodCols, rows: tiny });
  }
  { // cached TEMPO/DEC differs from the times
    const rows = prod.filter((r) => { const calc = [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].reduce((s, [a, b]) => s + (spanHours(a, b) ?? 0), 0); return !closeEnough(calc, r.h); }).map((r) => { const calc = [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].reduce((s, [a, b]) => s + (spanHours(a, b) ?? 0), 0); return pRow(r, `Excel diz ${f1(r.h)} h, os horários dão ${f1(calc)} h`); });
    add({ id: 'p-dec', area: 'Produção', level: 'atenção', title: 'Horas diferentes da soma dos horários', why: 'O valor guardado (TEMPO/DEC) não bate com início e fim. Os gráficos usam o valor guardado.', head: prodCols, rows });
  }
  { // final plate blank (breaks the operator and the link with the stops)
    const rows = prod.filter((r) => { const t = Number(r.t); return !(t === 1 || t === 2 || t === 3) ? true : !(t === 3 ? r.c3 : t === 2 ? r.c2 : r.c1); }).map((r) => pRow(r, Number(r.t) >= 1 && Number(r.t) <= 3 ? `turno que finalizou ${r.t}, mas sem chapa nesse turno` : 'turno que finalizou em branco'));
    add({ id: 'p-chapa', area: 'Produção', level: 'erro', title: 'Chapa final em branco', why: 'Sem chapa final a peça fica sem operador e não liga com as paradas da mesma chapa.', head: prodCols, rows });
  }
  { // two pieces at the same time on one machine
    const rows = overlaps(prod, prodSegs).map(([x, y, m]) => [dmy(x.d), x.m, `${x.p}-${x.o}  ×  ${y.p}-${y.o}`, `${times(x)}  ×  ${times(y)}`, +(m / 60).toFixed(2), `${f1(m / 60)} h no mesmo horário`]);
    add({ id: 'p-over', area: 'Produção', level: 'erro', title: 'Duas peças no mesmo horário na mesma máquina', why: 'Uma máquina faz uma peça por vez. Horários sobrepostos contam as horas em dobro.', head: prodCols, rows });
  }
  { // efficiency outliers (only pieces with a standard time)
    const rows = [];
    for (const r of prod) { const tp = r.tp > 0 ? r.tp : standardByPieceModel(r.p, r.o, r.m); if (tp > 0 && r.h > 0) { const e = tp / r.h; if (e > 4 || e < 0.2) rows.push(pRow(r, `real ${f1(r.h)} h para padrão ${f1(tp)} h (${Math.round(e * 100)}%)`)); } }
    add({ id: 'p-eff', area: 'Produção', level: 'atenção', title: 'Real muito longe do padrão', why: 'Eficiência acima de 400% ou abaixo de 20% numa peça: horário errado, peça ou modelo trocado, ou tempo padrão errado.', head: prodCols, rows });
  }
  { // pieces without a standard time
    const by = new Map();
    for (const r of prod) { if (r.tp > 0 || standardByPieceModel(r.p, r.o, r.m) > 0) continue; const k = `${r.p}|${r.o}`; const x = by.get(k) ?? { p: r.p, o: r.o, n: 0, h: 0, ms: new Set() }; x.n++; x.h += r.h; x.ms.add(r.m); by.set(k, x); }
    const rows = [...by.values()].sort((a, b) => b.n - a.n).map((x) => ['', [...x.ms].sort().join(', '), `${x.p}-${x.o}`, '', +x.h.toFixed(2), `${x.n} peça(s) sem tempo padrão em nenhuma máquina da matriz`]);
    add({ id: 'p-std', area: 'Produção', level: 'atenção', title: 'Peças sem tempo padrão', why: 'Ficam fora da entrega (horas padrão). Complete a MATRIZ TEMPO ou corrija o nome.', head: prodCols, rows, hours: [...by.values()].reduce((s, x) => s + x.h, 0) });
  }
  { // unknown plates (when the operators list is available)
    if (known && known.size) {
      const rows = [], seen = new Set();
      for (const r of prod) for (const c of [r.c1, r.c2, r.c3]) if (c && !known.has(String(c)) && !seen.has(c)) { seen.add(c); rows.push(pRow(r, `chapa ${c} não está na lista de operadores`)); }
      add({ id: 'p-known', area: 'Produção', level: 'atenção', title: 'Chapa fora da lista de operadores', why: 'A chapa pode estar digitada errada ou faltar na lista (o nome não aparece).', head: prodCols, rows });
    }
  }
  { // plates that do not look like a plate (3 to 6 digits)
    const rows = [];
    for (const r of prod) for (const c of [r.c1, r.c2, r.c3]) if (c && !/^\d{3,6}$/.test(String(c))) rows.push(pRow(r, `chapa "${c}" não parece uma chapa (3 a 6 números)`));
    for (const x of stops) if (x.c && !/^\d{3,6}$/.test(String(x.c))) rows.push(sRow(x, `chapa "${x.c}" não parece uma chapa`));
    add({ id: 'p-fmt', area: 'Produção', level: 'atenção', title: 'Chapa com formato estranho', why: 'Chapa com letras ou poucos números costuma ser erro de digitação.', head: prodCols, rows });
  }
  { // weekends with production (information)
    const rows = prod.filter((r) => { const w = new Date(`${r.d}T12:00:00Z`).getUTCDay(); return w === 0 || w === 6; }).map((r) => pRow(r, 'sábado ou domingo'));
    add({ id: 'p-wk', area: 'Produção', level: 'info', title: 'Produção em sábado ou domingo', why: 'Pode ser trabalho de fim de semana de verdade, ou data digitada errada.', head: prodCols, rows });
  }

  // ---------------------------------------------------------------- stops
  { // repeated stops
    const seen = new Map(), rows = [];
    for (const s of stops) seen.set(keyS(s), (seen.get(keyS(s)) || 0) + 1);
    for (const s of stops) { const n = seen.get(keyS(s)); if (n > 1) { rows.push(sRow(s, `${n} paradas iguais`)); seen.set(keyS(s), -1); } }
    add({ id: 's-dup', area: 'Paradas', level: 'atenção', title: 'Paradas repetidas', why: 'Mesma máquina, dia, chapa, horário e motivo: pode ser parada lançada duas vezes (soma em dobro).', head: stopCols, rows });
  }
  { // missing fields
    const rows = [];
    for (const s of stops) {
      if (!s.i || !s.f) rows.push(sRow(s, 'sem início ou fim'));
      else if (!(s.h > 0)) rows.push(sRow(s, s.i === '00:00' && s.f === '00:00' ? 'sem horário (00:00–00:00)' : 'duração zero'));
      if (!s.mo) rows.push(sRow(s, 'sem motivo'));
      if (s.t == null) rows.push(sRow(s, 'sem turno'));
      if (!s.c) rows.push(sRow(s, 'sem chapa'));
    }
    add({ id: 's-miss', area: 'Paradas', level: 'erro', title: 'Parada com campo faltando', why: 'Sem motivo ela some do Pareto; sem chapa não liga com a produção; sem horário não tem duração.', head: stopCols, rows });
  }
  { // too long
    const rows = stops.filter((s) => s.h > 12).map((s) => sRow(s, `${f1(s.h)} h numa única parada`));
    add({ id: 's-long', area: 'Paradas', level: 'atenção', title: 'Parada com mais de 12 h', why: 'Parada longa assim costuma ser horário errado (ou várias paradas juntas).', head: stopCols, rows });
  }
  { // cached TEMPO/DEC differs
    const rows = stops.filter((s) => s.i && s.f && !closeEnough(spanHours(s.i, s.f) ?? 0, s.h)).map((s) => sRow(s, `Excel diz ${f1(s.h)} h, os horários dão ${f1(spanHours(s.i, s.f))} h`));
    add({ id: 's-dec', area: 'Paradas', level: 'atenção', title: 'Horas da parada diferentes dos horários', why: 'O valor guardado não bate com início e fim.', head: stopCols, rows });
  }
  { // stops overlapping each other on one machine
    let h = 0;
    const rows = overlaps(stops.filter((x) => x.i && x.f), stopSegs).map(([x, y, m]) => { h += m / 60; return [dmy(x.d), x.m, `${x.c} × ${y.c}`, `${x.i}–${x.f} × ${y.i}–${y.f}`, `${x.mo} × ${y.mo}`, +(m / 60).toFixed(2), `${f1(m / 60)} h contadas duas vezes`]; });
    add({ id: 's-over', area: 'Paradas', level: 'erro', title: 'Duas paradas no mesmo horário na mesma máquina', why: 'A máquina só para uma vez por horário. Horários sobrepostos contam as horas em dobro.', head: stopCols, rows, hours: h });
  }
  { // stop typed over a production period (the same clock time counted as produced and as stopped)
    const byM = new Map(), rows = []; let h = 0;
    for (const r of prod) (byM.get(r.m) ?? byM.set(r.m, []).get(r.m)).push(...prodSegs(r));
    for (const x of stops) { const P = byM.get(x.m); if (!P || !x.i || !x.f) continue; const m = overlapMin(stopSegs(x), P); if (m > 5) { h += m / 60; rows.push(sRow(x, `${f1(m / 60)} h dentro de um horário de produção`)); } }
    add({ id: 's-prod', area: 'Cruzamentos', level: 'atenção', title: 'Parada dentro do horário de produção', why: 'A mesma hora aparece como produzida e parada, o que passa as 24 h do dia. Pode ser parada curta dentro da peça (normal) ou erro.', head: stopCols, rows, hours: h });
  }
  { // stop whose plate has no production that day on that machine
    const have = new Set(prod.flatMap((r) => { const t = Number(r.t); const c = t === 3 ? r.c3 : t === 2 ? r.c2 : t === 1 ? r.c1 : ''; return c ? [`${r.d}|${r.m}|${c}`] : []; }));
    const rows = stops.filter((s) => s.c && !have.has(`${s.d}|${s.m}|${s.c}`)).map((s) => sRow(s, 'a chapa não tem produção nesse dia e máquina'));
    add({ id: 's-nolink', area: 'Cruzamentos', level: 'atenção', title: 'Parada sem produção da mesma chapa', why: 'Nas telas "das chapas filtradas" essa parada não entra. Pode ser chapa digitada errada na parada ou na produção.', head: stopCols, rows, hours: rows.reduce((a, r) => a + r[5], 0) });
  }
  { // motivos spelled in more than one way
    const by = new Map();
    for (const s of stops) { const k = aliasKey(s.mo.replace(/\bAGUARD\b\.?/g, 'AGUARDANDO')); const o = by.get(k) ?? new Map(); o.set(s.mo, (o.get(s.mo) || 0) + 1); by.set(k, o); }
    const rows = [];
    for (const o of by.values()) if (o.size > 1) rows.push(['', '', '', '', [...o].map(([m, n]) => `${m || '(vazio)'} (${n})`).join('  |  '), '', 'o mesmo motivo escrito de formas diferentes']);
    add({ id: 's-mot', area: 'Paradas', level: 'info', title: 'Motivo escrito de mais de um jeito', why: 'Cada grafia vira uma barra diferente no Pareto. Unificar deixa a análise mais clara.', head: stopCols, rows });
  }

  // ---------------------------------------------------------------- the whole day
  { // machine-days over 24 h (midnight to midnight) and production above the daily goal
    const rows = auditDays(prod, stops).map((x) => [dmy(x.d), x.m, '', '', '', +x.tot.toFixed(2), `produção ${f1(x.ph)} h + paradas ${f1(x.sh)} h · ${x.why}`]);
    add({ id: 'd-24', area: 'Dia inteiro', level: 'erro', title: 'Máquina com mais de 24 h no dia (meia-noite a meia-noite)', why: 'Produção + paradas da mesma máquina no mesmo dia (de 00:00 a 24:00) não pode passar de 24 h. O que atravessa a meia-noite é dividido entre os dois dias.', head: stopCols, rows });
    const days = new Map();
    for (const r of prod) { const x = days.get(`${r.d}|${r.m}`) ?? { m: r.m, d: r.d, ph: 0, sh: 0 }; x.ph += r.h; days.set(`${r.d}|${r.m}`, x); }
    for (const s2 of stops) { const x = days.get(`${s2.d}|${s2.m}`) ?? { m: s2.m, d: s2.d, ph: 0, sh: 0 }; x.sh += s2.h; days.set(`${s2.d}|${s2.m}`, x); }
    const rows2 = [...days.values()].filter((x) => x.ph > 18.58 + 1e-4 && x.ph + x.sh <= 24.0001).map((x) => [dmy(x.d), x.m, '', '', '', +x.ph.toFixed(2), `produziu ${f1(x.ph)} h (meta do dia: 18,58 h)`]);
    add({ id: 'd-meta', area: 'Dia inteiro', level: 'info', title: 'Produção acima de 18,58 h no dia', why: 'Disponibilidade acima de 100%: pode ser verdade, mas vale conferir.', head: stopCols, rows: rows2 });
  }
  { // machines without any record on a weekday inside the machine's own period
    const dates = [...new Set([...prod.map((r) => r.d), ...stops.map((s) => s.d)])].sort();
    const machines = [...new Set(prod.map((r) => r.m))].sort(), rows = [];
    if (dates.length) {
      const have = new Set([...prod, ...stops].map((r) => `${r.d}|${r.m}`)), all = new Set(dates);
      const first = dates[0], last = dates.at(-1);
      for (let d = first; d <= last; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        const w = new Date(`${d}T12:00:00Z`).getUTCDay();
        if (w === 0 || w === 6 || !all.has(d)) continue;   // only days where someone else worked
        for (const m of machines) if (!have.has(`${d}|${m}`)) rows.push([dmy(d), m, '', '', '', '', 'dia útil em que outras máquinas trabalharam e esta não tem nenhum registro']);
      }
    }
    add({ id: 'd-gap', area: 'Dia inteiro', level: 'info', title: 'Máquina sem registro em dia de trabalho', why: 'Pode ser máquina parada sem lançamento ou folha que faltou subir.', head: stopCols, rows });
  }
  return out.sort((a, b) => level[a.level] - level[b.level] || b.count - a.count);
}

// the numbers that must close: used to cross-check the screens against the raw records
export function totals({ prod, stops }) {
  const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  return { prod: prod.length, stops: stops.length, horasProd: sum(prod, (r) => r.h), horasParadas: sum(stops, (s) => s.h), tp: sum(prod, (r) => r.tp > 0 ? r.tp : standardByPieceModel(r.p, r.o, r.m)) };
}
export { standardHours };
