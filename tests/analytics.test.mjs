import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weighted,curve,series,analyze,beforeYear,BOND_BUCKETS,SHORT_BUCKETS} from '../docs/analisis/analytics.mjs';
const r=(date,nominal,days,rate,extra={})=>({date,nominal,days,tea_pct:rate,instrument:'BONOS',channel:'Primario bursátil',effective:nominal,...extra});
test('nominal weighting excludes missing rates and preserves real zero',()=>{assert.equal(weighted([r('',100,1,0),r('',300,1,4),r('',500,1,null)],'tea_pct'),3);assert.equal(weighted([],'tea_pct'),null);});
test('comparison windows are disjoint, inclusive and keep an explicit cutoff',()=>{const rows=[r('2026-09-15',100,100,2),r('2026-10-14',100,100,3),r('2026-10-15',100,100,4),r('2026-11-13',100,100,6),r('2026-11-14',100,100,9)];const a=analyze(rows,{instrument:'BONOS',channel:'Primario bursátil',asof:'2026-11-13',windowDays:30,rate:'tea_pct'});assert.equal(a.current.n,2);assert.equal(a.previous.n,2);assert.equal(a.rate,5);assert.equal(a.prevRate,2.5);});
test('invalid maturity excluded from rates but remains in volume',()=>{const rows=[r('2026-01-05',100,80,4),r('2026-01-05',300,80,8,{maturity:'2026-01-01'})];const s=series(rows,'2026-01-01','2026-02-28','tea_pct',SHORT_BUCKETS);assert.equal(s[0].nominal,400);assert.equal(s[0].rate,4);assert.equal(s[1].rate,null);assert.equal(s[1].nominal,0);});
test('bucket boundaries, sparse samples and no invented curve nodes',()=>{const c=curve([r('2026-01-05',100,90,2),r('2026-01-05',300,91,3)],'2026-01-01','2026-01-31','tea_pct',SHORT_BUCKETS);assert.equal(c.points[0].n,1);assert.equal(c.points[1].n,1);assert.equal(c.points[2].rate,null);assert.equal(c.points[0].maxShare,1);});
test('leap day prior-year comparison',()=>assert.equal(beforeYear('2024-02-29'),'2023-02-28'));
test('CETES and Notas form one continuous series without changing source names',()=>{
 const rows=[r('2026-01-20',100,90,2,{instrument:'CETES'}),r('2026-02-05',300,180,4,{instrument:'NOTAS'}),r('2026-02-05',900,180,8,{instrument:'NOTAS',channel:'Colocación directa'}),r('2026-02-05',700,180,9)];
 const a=analyze(rows,{instrument:'TESORO',channel:'Primario bursátil',asof:'2026-02-10',windowDays:30,rate:'tea_pct'});
 assert.equal(a.nominalYtd,400);assert.equal(a.current.n,2);assert.equal(a.rate,3.5);
 assert.deepEqual(a.monthly.map(m=>m.nominal),[100,300]);assert.equal(a.last,'2026-02-05');
 assert.deepEqual(a.rows.map(r=>r.instrument),['CETES','NOTAS']);assert.equal(a.buckets,SHORT_BUCKETS);
});
test('CETES do not move cutoff back to their final observation',()=>{const a=analyze([r('2026-02-05',100,90,4,{instrument:'CETES'})],{instrument:'CETES',channel:'Primario bursátil',asof:'2026-11-13',windowDays:30,rate:'tea_pct'});assert.equal(a.current.n,0);assert.equal(a.rate,null);assert.equal(a.nominalYtd,100);assert.equal(a.last,'2026-02-05');});
test('real-data headline and monthly totals reconcile independently',()=>{const raw=JSON.parse(readFileSync(new URL('../docs/data/dashboard.json',import.meta.url),'utf8'));const rows=raw.rows.map(r=>Object.fromEntries(raw.columns.map((k,i)=>[k,r[i]])));const a=analyze(rows,{instrument:'BONOS',channel:'Primario bursátil',asof:'2026-11-13',windowDays:30,rate:'tea_pct'});const expected=rows.filter(r=>r.instrument==='BONOS'&&r.channel==='Primario bursátil'&&r.date>='2026-01-01'&&r.date<='2026-11-13').reduce((s,r)=>s+r.nominal,0);assert.ok(Math.abs(a.nominalYtd-expected)<.01);assert.ok(Math.abs(a.monthly.reduce((s,m)=>s+m.nominal,0)-a.rows.reduce((s,r)=>s+r.nominal,0))<.01);assert.equal(a.current.n,77);assert.equal(a.current.points.reduce((s,p)=>s+p.n,0),a.current.validN);});
