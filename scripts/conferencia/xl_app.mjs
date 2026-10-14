import fs from 'fs'; import * as XLSX from '../../node_modules/xlsx/xlsx.mjs';
import { parseHistoryWorkbook } from '../../src/core/history.js';
XLSX.set_fs?.(fs);
const U='./arquivos/', SP='./saida/';
const ind=JSON.parse(fs.readFileSync(SP+'xl_indep.json','utf8'));
for (const [g,f] of [['raw','057934d5-CONTROLE_DE_PARADA_DE_M_QUINAS_RAW.xlsx'],['usi','b23d6d85-CONTROLE_DE_PARADA_DE_USINAGEM.xlsx']]) {
  const r = parseHistoryWorkbook(XLSX, fs.readFileSync(U+f));
  const P=r.prod??r.records?.prod, S=r.stops??r.records?.stops;
  const norm=(m)=>m.toUpperCase().replace(/[ -]/g,'');
  const agg=(rows,tpOn)=>{const m=new Map(); for(const x of rows){const k=norm(x.m)+'|'+x.d; const a=m.get(k)??{n:0,h:0,tp:0}; a.n++; a.h+=x.h; a.tp+=tpOn?(x.tp||0):0; m.set(k,a);} return m;};
  const cmp=(name,exp,got,tpOn)=>{let bad=0,ex=[]; const keys=new Set([...exp.map(e=>e[0]+'|'+e[1]),...got.keys()]);
    const em=new Map(exp.map(e=>[e[0]+'|'+e[1],e]));
    for(const k of keys){const e=em.get(k),a=got.get(k); const en=e?e[2]:0,eh=e?e[3]:0,et=e&&tpOn?e[4]:0; const an=a?a.n:0,ah=a?a.h:0,at=a?a.tp:0;
      if(en!==an||Math.abs(eh-ah)>1e-6||(tpOn&&Math.abs(et-at)>1e-6)){bad++; if(ex.length<6)ex.push({k,pandas:[en,+eh.toFixed(3),+et.toFixed(3)],app:[an,+ah.toFixed(3),+at.toFixed(3)]});}}
    console.log(g,name,'máquina-dias',keys.size,'divergências',bad); if(ex.length)console.log(JSON.stringify(ex));};
  console.log(g,'app: produções',P.length,'paradas',S.length,'| pandas:',ind[g].np,ind[g].ns);
  cmp('produção',ind[g].prod,agg(P,true),true); cmp('paradas',ind[g].stops,agg(S,false),false);
}
