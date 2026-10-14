import fs from 'fs';
import { buildCube, pareto } from '../../src/core/bi.js';
const SP='./saida/';
const [name,src]=process.argv.slice(2);
const b=JSON.parse(fs.readFileSync(SP+src,'utf8')); const cube=buildCube({prod:b.prod.map(({cnt,cf,...r})=>r),stops:b.stops},()=>'');
const C=JSON.parse(fs.readFileSync(SP+`pareto_${name}.json`,'utf8')); let bad=0,n=0; const ex=[];
for(const c of C){ const got=pareto(cube,{p:{},s:Object.fromEntries(Object.entries(c.s).map(([k,v])=>[k,new Set(v)]))});
  const gm=new Map(got.map(g=>[g.mo,g])); n+=c.exp.length;
  if(got.length!==c.exp.length){bad++;ex.push({ctx:c.label,msg:`motivos ${got.length} vs ${c.exp.length}`});continue;}
  for(const e of c.exp){const g=gm.get(e.mo); if(!g||Math.abs(g.h-e.h)>1e-6||Math.abs(g.acc-e.acc)>1e-6||Math.abs(g.pctAcc-e.pct)>1e-9){bad++;if(ex.length<8)ex.push({ctx:c.label,mo:e.mo,esp:e,app:g});}} }
console.log(name,'contextos',C.length,'barras comparadas',n,'divergências',bad); if(ex.length)console.log(JSON.stringify(ex.slice(0,5)));
