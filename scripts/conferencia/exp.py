import json, pandas as pd
from pbixray import PBIXRay
U='./arquivos/'
SP='./saida/'
def t(v):
    if v is None or v is pd.NA or (isinstance(v,float) and pd.isna(v)) or v is pd.NaT: return ''
    s=str(v); s=s.split(' ')[-1]; return s[:5] if ':' in s else ''
def ch(v):
    s='' if v is None or v is pd.NA or (isinstance(v,float) and pd.isna(v)) else str(v).strip()
    return s[:-2] if s.endswith('.0') else s
def sx(v):
    return '' if v is None or v is pd.NA or (isinstance(v,float) and pd.isna(v)) else str(v).strip()
def num(v): return 0.0 if v is None or v is pd.NA or pd.isna(v) else float(v)
for name,f,mc in [('raw','fa65215c-Controle_de_Parada_de_Maquina_RAW.pbix','ROBÔ'),('usi','fc1816ad-Controle_de_Parada_de_Maquina_de_usinagem_1.pbix','MAQUINA')]:
    m=PBIXRay(U+f); P=m.get_table('01_Produção'); S=m.get_table('02_Paradas')
    prod=[];stops=[]
    for _,r in P.iterrows():
        if pd.isna(r['DATA']): continue
        mm=str(r[mc]).replace('HMC-','HMC-').strip()
        prod.append(dict(m=mm,d=pd.to_datetime(r['DATA']).strftime('%Y-%m-%d'),p=sx(r['PEÇA ']),o=sx(r['MODELO']),c1=ch(r['1T - CHAPA']),i1=t(r['1T- INÍCIO']),f1=t(r['1T - FIM']),c2=ch(r['T2 - CHAPA']),i2=t(r['T2 - INICIO']),f2=t(r['T2- FIM']),c3=ch(r['T3 - CHAPA3']),i3=t(r['T3 - INCIO']),f3=t(r['T3 -  FIM']),t=None if pd.isna(r['TURNO QUE FINALIZOU']) else int(r['TURNO QUE FINALIZOU']),h=num(r['TEMPO/DEC']),tp=num(r['TEMPO PADRÃO BAAN']),cnt=num(r['peca_modelo_contagem']),cf=ch(r['Chapa final'])))
    for _,r in S.iterrows():
        if pd.isna(r['DATA']): continue
        stops.append(dict(m=str(r[mc]).strip(),d=pd.to_datetime(r['DATA']).strftime('%Y-%m-%d'),c=ch(r['CHAPA']),i=t(r['INICIO ']),f=t(r['FINAL ']),t=None if pd.isna(r['TURNO']) else int(r['TURNO']),mo=sx(r['MOTIVO DA PARADA']),ds=sx(r['DESCRIÇÃO DA PARADA']),h=num(r['TEMPO/DEC'])))
    json.dump(dict(prod=prod,stops=stops),open(SP+f'pbix_{name}.json','w'))
    # DAX measures, independent (pandas)
    pp=pd.DataFrame(prod); ss=pd.DataFrame(stops)
    print('=====',name.upper(),len(pp),len(ss))
    res=[]
    for mach,g in list(pp.groupby('m'))+[('TOTAL',pp)]:
        tgt=18.58*g['d'].nunique(); hs=g['h'].sum()
        sg=ss if mach=='TOTAL' else ss[ss.m==mach]
        res.append(dict(m=mach,qtd=g['cnt'].sum(),linhas=len(g),horas=round(hs,2),target=round(tgt,2),pct=round(hs/tgt,4),paradas=round(sg['h'].sum(),2)))
    print(pd.DataFrame(res).to_string(index=False))
