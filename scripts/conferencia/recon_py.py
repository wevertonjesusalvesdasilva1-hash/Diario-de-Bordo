# Independent evaluation of the Power BI model (pandas, straight from the .pbix tables) over many filter contexts.
import sys, json, itertools, random
import pandas as pd
from pbixray import PBIXRay
U='./arquivos/'
SP='./saida/'
name, f = sys.argv[1], sys.argv[2]
m=PBIXRay(U+f); P=m.get_table('01_Produção').copy(); S=m.get_table('02_Paradas').copy(); R=m.get_table('02_Paradas_resumo').copy()
mc='ROBÔ' if 'ROBÔ' in P.columns else 'MAQUINA'; smc='ROBÔ' if 'ROBÔ' in S.columns else 'MAQUINA'
kp='Chave parada' if 'Chave parada' in P.columns else 'Chave_paradas'
P=P[P['DATA'].notna()].copy(); S=S[S['DATA'].notna()].copy()
P['d']=pd.to_datetime(P['DATA']).dt.strftime('%Y-%m-%d'); S['d']=pd.to_datetime(S['DATA']).dt.strftime('%Y-%m-%d')
P['h']=pd.to_numeric(P['TEMPO/DEC'],errors='coerce').fillna(0.0); S['h']=pd.to_numeric(S['TEMPO/DEC'],errors='coerce').fillna(0.0)
P['tp']=pd.to_numeric(P['TEMPO PADRÃO BAAN'],errors='coerce').fillna(0.0)
P['mes']=P['Nome do Mês'].astype(str); S['mes']=S['Nome do mes'].astype(str)
P['m']=P[mc].astype(str).str.strip(); S['m']=S[smc].astype(str).str.strip()
P['pm']=P['peca_modelo'].astype(str); P['cf']=P['Chapa final'].astype(object).where(P['Chapa final'].notna(),'')
P['cf']=P['cf'].astype(str).str.replace(r'\.0$','',regex=True)
P['t']=P['TURNO QUE FINALIZOU'].apply(lambda v:'' if pd.isna(v) else str(int(v)))
S['mo']=S['MOTIVO DA PARADA'].apply(lambda v:'' if pd.isna(v) else str(v).strip()); S['t']=S['TURNO'].apply(lambda v:'' if pd.isna(v) else str(v).strip().replace('.0',''))
S['c']=S['CHAPA'].apply(lambda v:'' if pd.isna(v) else str(v).strip().replace('.0',''))
rc='Contagem' if 'Contagem' in R.columns else 'Paradas'; Rm=R.set_index('Chave')[rc].astype(float).to_dict()
P['kp']=P[kp].astype(str); S['kk']=S['Chave'].astype(str); P['kd']=P['Chave'].astype(str)
SIDE_P={'data':'d','mes':'mes','m':'m','pm':'pm','t':'t','cf':'cf'}; SIDE_S={'data':'d','mes':'mes','m':'m','mo':'mo','t':'t','c':'c'}
def ctx(fp,fs):
    p=P; s=S
    for k,v in (fp or {}).items(): p=p[p[SIDE_P[k]].isin(v)]
    for k,v in (fs or {}).items(): s=s[s[SIDE_S[k]].isin(v)]
    vp,vs=p,s
    if fs: vp=p[p['kp'].isin(set(s['kk']))]
    if fp: vs=s[s['kk'].isin(set(p['kp']))]
    return vp,vs
def measures(vp,vs):
    n=len(vp); h=vp['h'].sum(); tgt=18.58*vp['m'].nunique()*vp['d'].nunique(); tp=vp['tp'].sum()
    keys=set(vp['kd']); res=sum(Rm.get(k,0.0) for k in keys)
    return dict(qtd=float(n),horas=float(h),paradas=float(vs['h'].sum()),resumo=float(res),target=float(tgt),pct=float(h/tgt) if tgt else 0.0,ganho=float((tp-h)/tp) if tp else None,tp=float(tp))
dom=lambda col,s:sorted(str(x) for x in s[col].unique().tolist())
dP={k:dom(v,P) for k,v in SIDE_P.items()}; dS={k:dom(v,S) for k,v in SIDE_S.items()}
random.seed(7); C=[]
C.append(('todos',{},{}))
for k in ['m','mes','t','data','pm','cf']:
    for v in dP[k]: C.append((f'P {k}={v}',{k:[v]},{}))
for k in ['m','mes','t','data','mo','c']:
    for v in dS[k]: C.append((f'S {k}={v}',{},{k:[v]}))
for a in dP['m']:
    for b in dP['mes']: C.append((f'P m={a} mes={b}',{'m':[a],'mes':[b]},{}))
    for b in dP['t']: C.append((f'P m={a} t={b}',{'m':[a],'t':[b]},{}))
for a in dS['m']:
    for b in dS['mes']: C.append((f'S m={a} mes={b}',{},{'m':[a],'mes':[b]}))
    for b in dS['mo']: C.append((f'S m={a} mo={b}',{},{'m':[a],'mo':[b]}))
for _ in range(400):   # random multi-day / multi-value selections like the slicers
    days=random.sample(dP['data'],random.randint(2,min(10,len(dP['data']))))
    ms=random.sample(dP['m'],random.randint(1,len(dP['m'])))
    C.append((f'P dias={len(days)} m={len(ms)}',{'data':days,'m':ms},{}))
    sd=random.sample(dS['data'],random.randint(2,min(10,len(dS['data'])))); sm=random.sample(dS['m'],random.randint(1,len(dS['m'])))
    C.append((f'S dias={len(sd)} m={len(sm)}',{},{'data':sd,'m':sm}))
    mo=random.sample(dS['mo'],random.randint(1,min(3,len(dS['mo'])))); C.append((f'S mo={len(mo)} dias={len(sd)}',{},{'mo':mo,'data':sd}))
    pm=random.sample(dP['pm'],random.randint(1,min(3,len(dP['pm'])))); C.append((f'P pm={len(pm)} m={len(ms)}',{'pm':pm,'m':ms},{}))
out=[]
for label,fp,fs in C:
    vp,vs=ctx(fp,fs); out.append(dict(label=label,p=fp,s=fs,exp=measures(vp,vs)))
json.dump(out,open(SP+f'recon_{name}.json','w'))
print(name,len(out),'contextos')

# ---- Pareto (12/13/14) evaluated independently, S-side filters
def pareto_exp(fs):
    s=S
    for k,v in fs.items(): s=s[s[SIDE_S[k]].isin(v)]
    p=P
    vs=s if not fs else s   # no production filter: stops are not cut
    allm=vs.groupby('mo')['h'].sum()                      # every motive in context (ALL() of motive ignores the motive filter only)
    total=float(allm.sum()); hs=sorted(set(round(x,12) for x in allm.values),reverse=True)
    rank=lambda h:hs.index(round(h,12))+1
    rows=[]
    for mo,h in allm.items():
        if h<=0: continue
        rk=rank(h); acc=float(sum(x for x in allm.values if rank(x)<=rk)); rows.append(dict(mo=mo,h=float(h),acc=acc,pct=acc/total if total else 0))
    return rows
PC=[('todos',{})]+[(f'm={v}',{'m':[v]}) for v in dS['m']]+[(f'mes={v}',{'mes':[v]}) for v in dS['mes']]+[(f't={v}',{'t':[v]}) for v in dS['t']]+[(f'm={a} mes={b}',{'m':[a],'mes':[b]}) for a in dS['m'] for b in dS['mes']]
random.seed(3)
for _ in range(60):
    PC.append(('dias',{'data':random.sample(dS['data'],random.randint(1,8)),'m':random.sample(dS['m'],random.randint(1,len(dS['m'])))}))
json.dump([dict(label=l,s=fs,exp=pareto_exp(fs)) for l,fs in PC],open(SP+f'pareto_{name}.json','w'))
