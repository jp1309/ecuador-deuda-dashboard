"""Download BVQ workbooks, validate them and publish an auditable static dataset."""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import time
import unicodedata
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import xlrd
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.bolsadequito.com/'
PAGES = {k: BASE + 'index.php/estadisticas/boletines-2/' + v for k, v in
         [('historical', 'cotizaciones-historicas'), ('public', 'sector-publico')]}
FILES = {'bonos.xls':'historical', 'cetes.xls':'historical',
         'negociaciones-sector-publico.xlsx':'public',
         'montos-negociados-mensuales.xls':'public', 'montos-negociados-acumulados.xls':'public'}
FIELDS = ['id','source','sheet','row','date','instrument','channel','issuer','decree',
          'nominal','effective','price_pct','yield_pct','tea_pct','coupon_pct','days',
          'issued','maturity','origin','original_nominal','dirty_price_pct','flags']

def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(value or '').upper())
                   if not unicodedata.combining(c)).strip()

def number(value):
    if value in ('', None): return None
    if isinstance(value,str):
        value=value.replace('\xa0','').strip()
        if re.fullmatch(r'-?\d{1,3}(\.\d{3})*,\d+',value) or re.fullmatch(r'-?\d+,\d+',value):
            value=value.replace('.','').replace(',','.')
        elif not re.fullmatch(r'-?\d+(\.\d+)?',value):
            raise ValueError(f'Ambiguous numeric text: {value!r}')
    n=float(value)
    if not math.isfinite(n): raise ValueError('Non-finite number')
    return n

def iso(value, datemode=0):
    if value in ('',None): return None
    if isinstance(value,(float,int)): value=xlrd.xldate_as_datetime(value,datemode)
    if isinstance(value,(datetime,date)): return value.date().isoformat() if isinstance(value,datetime) else value.isoformat()
    if isinstance(value,str):
        match=re.fullmatch(r'(\d{1,2})-([a-z]{3})\.?-(\d{4})',value.strip().lower())
        if match:
            day,month,year=match.groups()
            months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
            return date(int(year),months.index(month)+1,int(day)).isoformat()
    raise ValueError(f'Unexpected date: {value!r}')

def optional_date(value,d,field,mode=0):
    try: return iso(value,mode)
    except ValueError:
        d['flags'].append(f'Fecha {field} inválida en fuente: {value}')
        return None

def read_book(path):
    if path.suffix=='.xls':
        b=xlrd.open_workbook(path)
        return [(s.name,[s.row_values(i) for i in range(s.nrows)],b.datemode) for s in b.sheets()]
    b=openpyxl.load_workbook(path,read_only=True,data_only=True)
    result=[(s.title,list(s.values),0) for s in b]
    b.close()
    return result

def header(rows):
    for i,r in enumerate(rows[:40]):
        if len(r)>1 and norm(r[1]).startswith('FECHA'):
            return i,{norm(v):j for j,v in enumerate(r) if v not in ('',None)}
    raise ValueError('Missing transaction header')

def record(source,sheet,row):
    d=dict.fromkeys(FIELDS)
    d.update(source=source,sheet=sheet,row=row,flags=[])
    return d

def parse_historical(path):
    output=[]
    for sheet,rows,mode in read_book(path):
        if not re.fullmatch(r'20\d{2}',sheet): raise ValueError(f'Unexpected historical sheet: {sheet}')
        h,cols=header(rows)
        required=['FECHA','VALOR NOMINAL (USD)','VALOR EFECTIVO (USD)','PROCEDENCIA']
        for key in required:
            if key not in cols: raise ValueError(f'{path.name}/{sheet}: missing {key}')
        bonds=path.name=='bonos.xls'
        market_col=cols.get('TIPO DE MERCADO') if bonds else cols.get('TIPO MERCADO')
        if market_col is None: raise ValueError('Missing textual market column')
        for n,r in enumerate(rows[h+1:],h+2):
            if all(v in ('',None) for v in r): continue
            d=record(path.name,sheet,n)
            # Column positions before the market fields are checked against key labels.
            expected={2:'DECRETO',3:'PRECIO %',4:'RENDIMIENTO %'} if bonds else {2:'EMISOR',4:'PRECIO (%)',5:'RENDIMIENTO (%)'}
            if any(cols.get(k)!=idx for idx,k in expected.items()): raise ValueError('Historical schema changed')
            d['date']=iso(r[cols['FECHA']],mode)
            market=norm(r[market_col])
            if market not in ('PRIMARIO','SECUNDARIO'): raise ValueError(f'Unknown market {market}')
            d['channel']='Primario bursátil' if market=='PRIMARIO' else 'Secundario bursátil'
            d['nominal']=number(r[cols['VALOR NOMINAL (USD)']])
            d['effective']=number(r[cols['VALOR EFECTIVO (USD)']])
            d['origin']=str(r[cols['PROCEDENCIA']]).strip()
            if d['origin'] not in ('Q','G'): raise ValueError('Unknown provenance code')
            if bonds:
                d.update(instrument='BONOS',issuer='No informado en histórico de bonos',decree=str(r[2]),
                         price_pct=number(r[3]),yield_pct=number(r[4]),coupon_pct=number(r[5]),
                         tea_pct=number(r[6]),original_nominal=number(r[7]),days=number(r[10]),
                         issued=iso(r[11],mode),maturity=iso(r[12],mode))
            else:
                title=norm(r[3])
                instruments={'CERTIFICADOS DE TESORERIA':'CETES','NOTAS DEL TESORO':'NOTAS'}
                if title not in instruments: raise ValueError(f'Unknown title {title}')
                d.update(instrument=instruments[title],issuer=str(r[2]),price_pct=number(r[4]),
                         yield_pct=number(r[5]),tea_pct=number(r[6]),days=number(r[7]),
                         issued=iso(r[10],mode),maturity=iso(r[11],mode))
            output.append(d)
    return output

def parse_direct(path):
    output=[]; excluded=[]
    for sheet,rows,mode in read_book(path):
        h,cols=header(rows)
        # Reporto and BanEcuador are different instruments, retained in the audit only.
        excluded_sheet='reporto' in sheet.lower() or 'banecuador' in sheet.lower()
        bonds=sheet=='Reporte bolsas hist bonos'
        if not excluded_sheet and not bonds and sheet!='Reporte bolsas hist cetes-notas':
            raise ValueError(f'Unrecognized direct-placement sheet: {sheet}')
        if norm(rows[h][5]).replace('  ',' ') not in ('MONTO NOMINAL','MONTO INICIAL REPORTO'):
            raise ValueError('Direct placement schema changed')
        for n,r in enumerate(rows[h+1:],h+2):
            if all(v in ('',None) for v in r): continue
            if excluded_sheet:
                excluded.append({'source':path.name,'sheet':sheet,'row':n,'date':iso(r[1]),
                                 'amount':number(r[5]),'reason':'Reporto' if 'reporto' in sheet else 'Certificado de inversión BanEcuador'})
                continue
            d=record(path.name,sheet,n)
            inst='BONOS' if bonds else {'CETE':'CETES','NOTA':'NOTAS'}.get(norm(r[9]))
            if not inst: raise ValueError(f'Unknown direct title: {r[9]}')
            d.update(date=iso(r[1]),issued=optional_date(r[2],d,'emisión'),maturity=optional_date(r[4],d,'vencimiento'),days=number(r[3]),
                     nominal=number(r[5]),yield_pct=number(r[6])*100,price_pct=number(r[7])*100,
                     effective=number(r[9] if bonds else r[8]),instrument=inst,
                     channel='Colocación directa',issuer=str(rows[3][2]),
                     dirty_price_pct=number(r[8])*100 if bonds else None)
            output.append(d)
    return output,excluded

def parse_institutions(path):
    output=[]
    for sheet,rows,_ in read_book(path):
        if 'MERCADO NACIONAL' not in norm(rows[2][2]): raise ValueError('Institution report title changed')
        total_found=False; entries=[]
        for n,r in enumerate(rows[8:],9):
            if len(r)<14 or not str(r[2]).strip(): continue
            if norm(r[2])=='TOTAL':
                total=number(r[12]); total_found=True; break
            if isinstance(r[12],(int,float)):
                entries.append({'institution':str(r[2]).strip(),'code':str(r[3]).strip(),
                                'quito':number(r[4]),'guayaquil':number(r[8]),
                                'effective':number(r[12]),'adjusted':number(r[13]),'row':n})
        if not total_found or abs(sum(e['effective'] for e in entries)-total)>.1:
            raise ValueError(f'Institution total does not reconcile: {path.name}')
        for e in entries:
            if abs(e['quito']+e['guayaquil']-e['effective'])>.03: raise ValueError('Regional total mismatch')
        output.append({'source':path.name,'sheet':sheet,'period_start':str(rows[4][2]),
                       'period_end':str(rows[4][13]),'entries':entries,'total':total})
    return output

def validate(records):
    occurrences=Counter(); same=defaultdict(list); overlap=defaultdict(list)
    today=datetime.now(timezone.utc).date().isoformat()
    for d in records:
        if not d['date'] or d['date']>today: raise ValueError(f'Invalid transaction date {d["date"]}')
        if d['nominal'] is None or d['nominal']<=0 or d['effective'] is None or d['effective']<0:
            raise ValueError(f'Invalid amounts: {d["source"]}:{d["row"]}')
        if d['yield_pct'] is None or d['price_pct'] is None: raise ValueError('Missing rate or price')
        if d['maturity'] and d['maturity']<d['date']: d['flags'].append('Vencimiento anterior a negociación')
        if d['issued'] and d['issued']>d['date']: d['flags'].append('Emisión posterior a negociación')
        if abs(d['nominal']*d['price_pct']/100-d['effective'])>max(1,d['nominal']*.000001):
            d['flags'].append('Efectivo no coincide con nominal × precio')
        if d['yield_pct']<0 or d['yield_pct']>30: d['flags'].append('Rendimiento fuera de rango de revisión')
        semantic={k:v for k,v in d.items() if k not in ('id','row','flags')}
        fingerprint=hashlib.sha256(json.dumps(semantic,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:20]
        occurrences[fingerprint]+=1
        d['id']=f'{fingerprint}-{occurrences[fingerprint]}'
        same[fingerprint].append(d)
        if d['channel']!='Secundario bursátil':
            overlap[(d['date'],d['instrument'],round(d['nominal'],2),d['maturity'])].append(d)
    for group in same.values():
        if len(group)>1:
            for d in group: d['flags'].append('Fila idéntica en fuente; conservada')
    matches=0
    for group in overlap.values():
        if len({d['source'] for d in group})>1:
            matches+=1
            for d in group: d['flags'].append('Posible coincidencia entre fuentes')
    return {'flag_counts':dict(Counter(f for d in records for f in d['flags'])),
            'possible_overlap_groups':matches,'excluded_policy':'No se suman canales automáticamente; filas idénticas se conservan sin identificador de operación.'}

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.hrefs.extend(v for k,v in attrs if k=='href' and v)

def get(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url,headers={'User-Agent':'EcuadorDebtDashboard/1.0 (public BVQ research)'}),timeout=60) as r:
                if urlparse(r.url).hostname!='www.bolsadequito.com': raise ValueError('Unexpected redirect host')
                data=r.read(30_000_001)
                if len(data)>30_000_000: raise ValueError('Source exceeded 30 MB')
                return data,dict(r.headers)
        except Exception:
            if attempt==2: raise
            time.sleep(2**attempt)

def download(folder):
    urls={}; meta={}
    for key,page in PAGES.items():
        raw,_=get(page); parser=Links(); parser.feed(raw.decode('utf-8'))
        for name,group in FILES.items():
            if group!=key: continue
            found={urljoin(page,h) for h in parser.hrefs if Path(urlparse(h).path).name==name}
            if len(found)!=1: raise ValueError(f'Expected one download link for {name}, found {len(found)}')
            url=found.pop()
            if urlparse(url).hostname!='www.bolsadequito.com' or not url.startswith('https://'):
                raise ValueError('Unexpected source URL')
            urls[name]=url
    for name,url in urls.items():
        data,headers=get(url)
        signature=b'PK' if name.endswith('xlsx') else bytes.fromhex('d0cf11e0a1b11ae1')
        if not data.startswith(signature): raise ValueError(f'Not an Excel workbook: {name}')
        (folder/name).write_bytes(data)
        meta[name]={'url':url,'last_modified':headers.get('Last-Modified')}
    return meta

def build(folder,meta=None,previous=None):
    records=parse_historical(folder/'bonos.xls')+parse_historical(folder/'cetes.xls')
    direct,excluded=parse_direct(folder/'negociaciones-sector-publico.xlsx'); records+=direct
    institutions=[]
    for name in ('montos-negociados-mensuales.xls','montos-negociados-acumulados.xls'):
        institutions+=parse_institutions(folder/name)
    quality=validate(records); quality['excluded']=excluded
    sources=[]
    for name,group in FILES.items():
        selected=[r for r in records if r['source']==name]
        info=(meta or {}).get(name,{})
        source={'file':name,'page':PAGES[group],
                'url':info.get('url',BASE+'uploads/estadisticas/boletines/'+('cotizaciones-historicas/' if group=='historical' else 'sector-publico/')+name),
                'sha256':hashlib.sha256((folder/name).read_bytes()).hexdigest(),
                'rows':len(selected),'first_date':min((r['date'] for r in selected),default=None),
                'last_date':max((r['date'] for r in selected),default=None),
                'last_modified':info.get('last_modified')}
        sources.append(source)
    # Rebuild the current snapshot, never append daily duplicates. Keep retired year tabs.
    retired=[]
    if previous:
        old=[dict(zip(previous['columns'],r)) for r in previous['rows']]
        current_sheets={(r['source'],r['sheet']) for r in records}
        for key in {(r['source'],r['sheet']) for r in old}:
            prior=[r for r in old if (r['source'],r['sheet'])==key]
            if key not in current_sheets:
                if key[0] in ('bonos.xls','cetes.xls') and re.fullmatch(r'20\d{2}',key[1]) and int(key[1])<int(max(r['date'][:4] for r in records)):
                    records+=prior; retired.append({'source':key[0],'sheet':key[1],'rows':len(prior)})
                else: raise ValueError(f'Source sheet disappeared: {key}')
            else:
                current=[r for r in records if (r['source'],r['sheet'])==key]
                if len(current)<len(prior)*.95: raise ValueError(f'More than 5% of rows removed: {key}; review source revision')
                if max(r['date'] for r in current)<max(r['date'] for r in prior): raise ValueError(f'Source date regressed: {key}')
    quality['archived_sheets']=retired
    records.sort(key=lambda r:(r['date'],r['source'],r['sheet'],r['row']))
    data={'schema_version':1,'checked_at':datetime.now(timezone.utc).isoformat(),
          'sources':sources,'quality':quality,'institutions':institutions,
          'columns':FIELDS,'rows':[[d.get(k) for k in FIELDS] for d in records]}
    return data

def main():
    p=argparse.ArgumentParser(); p.add_argument('--offline',type=Path); args=p.parse_args()
    target=ROOT/'docs/data/dashboard.json'; target.parent.mkdir(parents=True,exist_ok=True)
    previous=json.loads(target.read_text(encoding='utf-8')) if target.exists() else None
    incoming=ROOT/'.incoming'; incoming.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=incoming) as temp:
        folder=Path(temp)
        if args.offline:
            for name in FILES: shutil.copy2(args.offline/name,folder/name)
            meta=None
        else: meta=download(folder)
        data=build(folder,meta,previous)
        payload=json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        # Nothing is published until all five files parse and validations pass.
        raw=ROOT/'data/raw'; raw.mkdir(parents=True,exist_ok=True)
        for name in FILES: shutil.copy2(folder/name,raw/name)
        tmp=target.with_suffix('.tmp'); tmp.write_text(payload,encoding='utf-8'); tmp.replace(target)
        (ROOT/'data/quality.json').write_text(json.dumps(data['quality'],ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'rows':len(data['rows']),'sources':data['sources'],'quality':data['quality']},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
