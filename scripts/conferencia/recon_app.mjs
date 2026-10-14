import fs from 'fs';
import { buildCube, slice, M } from '../../src/core/bi.js';
const SP='./saida/';
const [name, src] = process.argv.slice(2);
const b=JSON.parse(fs.readFileSync(SP+src,'utf8')); const cube=buildCube({prod:b.prod.map(({cnt,cf,...r})=>r),stops:b.stops},()=>'');
const C=JSON.parse(fs.readFileSync(SP+`recon_${name}.json`,'utf8'));
const set=(o)=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,new Set(v)]));
let bad=0; const byM={}; const ex=[];
for (const c of C) {
  const sl=slice(cube,{p:set(c.p),s:set(c.s)});
  const got={qtd:M.qtdPecas(sl),horas:M.horasProd(sl),paradas:M.horasParadas(sl),resumo:M.horasParadasResumo(sl),target:M.target(sl),pct:M.pct(sl),ganho:M.ganho(sl),tp:sl.P.reduce((a,r)=>a+(r.tp||0),0)};
  for (const k of Object.keys(c.exp)) { const e=c.exp[k], g=got[k]; byM[k]??={n:0,bad:0};
    byM[k].n++; const ok = (e==null && (g==null||Number.isNaN(g))) || (e!=null && g!=null && Math.abs(e-g)<1e-6) || (k==='ganho' && e==null && g===0);
    if(!ok){ byM[k].bad++; bad++; if(ex.length<40) ex.push({ctx:c.label,medida:k,powerbi_modelo:e,app:g}); } }
}
console.log(name,'contextos',C.length,'comparações',Object.values(byM).reduce((a,x)=>a+x.n,0),'divergências',bad); console.table(byM); if(ex.length) console.log(ex);
