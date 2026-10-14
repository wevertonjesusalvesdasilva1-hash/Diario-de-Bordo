import pandas as pd, json, warnings; warnings.filterwarnings('ignore')
U='./arquivos/'; SP='./saida/'
out={}
for g,f in [('raw','057934d5-CONTROLE_DE_PARADA_DE_M_QUINAS_RAW.xlsx'),('usi','b23d6d85-CONTROLE_DE_PARADA_DE_USINAGEM.xlsx')]:
    x=pd.ExcelFile(U+f)
    P=x.parse('PRODUÇÃO',header=1); S=x.parse('PARADAS',header=0)
    P.columns=[str(c).strip() for c in P.columns]
    mc='ROBÔ' if 'ROBÔ' in P.columns else [c for c in P.columns if c.upper().startswith('M')][0]
    smc='ROBÔ' if 'ROBÔ' in S.columns else 'MAQUINA'
    P=P[P['COD'].notna() & (P['COD'].astype(str).str.strip()!='') & P['DATA'].notna()].copy()
    P['d']=pd.to_datetime(P['DATA'],errors='coerce').dt.strftime('%Y-%m-%d'); P=P[P.d.notna()]
    tc=[c for c in P.columns if c.upper().replace(' ','').startswith('TEMPO/DEC')][0]; pc=[c for c in P.columns if 'PADR' in c.upper()][0]
    P['h']=pd.to_numeric(P[tc],errors='coerce').fillna(0); P['tp']=pd.to_numeric(P[pc],errors='coerce').fillna(0)
    P['m']=P[mc].astype(str).str.strip().str.upper().str.replace(' ','').str.replace('HMC-','HMC')  # normalised below
    S=S[S['DATA'].notna()].copy(); S['d']=pd.to_datetime(S['DATA'],errors='coerce').dt.strftime('%Y-%m-%d'); S=S[S.d.notna()&S[smc].notna()]
    S['h']=pd.to_numeric(S['TEMPO/DEC'],errors='coerce').fillna(0); S['m']=S[smc].astype(str).str.strip().str.upper().str.replace(' ','').str.replace('-','')
    P['m']=P['m'].str.replace('-','')
    agp=P.groupby(['m','d']).agg(n=('h','size'),h=('h','sum'),tp=('tp','sum')).reset_index(); ags=S.groupby(['m','d']).agg(n=('h','size'),h=('h','sum')).reset_index()
    out[g]=dict(prod=agp.values.tolist(),stops=ags.values.tolist(),np=len(P),ns=len(S))
    print(g,'linhas prod',len(P),'paradas',len(S),'horas prod',round(P.h.sum(),2),'tp',round(P.tp.sum(),2),'horas paradas',round(S.h.sum(),2))
json.dump(out,open(SP+'xl_indep.json','w'))
