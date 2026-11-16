export const CHANNELS=['Primario bursátil','Colocación directa','Secundario bursátil'];
export const NAMES={BONOS:'Bonos del Estado',TESORO:'CETES / Notas del Tesoro',CETES:'CETES',NOTAS:'Notas del Tesoro'};
// Analytical continuity across source denominations; never overwrite the original instrument.
export const instrumentGroup=instrument=>['CETES','NOTAS'].includes(instrument)?'TESORO':instrument;
export const matchesInstrument=(original,selected)=>selected==='all'||original===selected||instrumentGroup(original)===selected;
export const BOND_BUCKETS=[{label:'≤ 1 año',max:365},{label:'1–3 años',max:1095},{label:'3–5 años',max:1825},{label:'5–7 años',max:2555},{label:'7–10 años',max:3650},{label:'> 10 años',max:Infinity}];
export const SHORT_BUCKETS=[{label:'≤ 90 días',max:90},{label:'91–180 días',max:180},{label:'181–270 días',max:270},{label:'271–365 días',max:365},{label:'> 365 días',max:Infinity}];
export const sum=(rows,key='nominal')=>rows.reduce((s,r)=>s+(Number.isFinite(r[key])?r[key]:0),0);
export function weighted(rows,key){const valid=rows.filter(r=>Number.isFinite(r[key])&&Number.isFinite(r.nominal)&&r.nominal>0);const w=sum(valid);return w?valid.reduce((s,r)=>s+r[key]*r.nominal,0)/w:null;}
export const shift=(iso,days)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export const beforeYear=iso=>{const y=Number(iso.slice(0,4))-1;const md=iso.slice(5)==='02-29'?'02-28':iso.slice(5);return `${y}-${md}`;};
export function months(from,to){if(!from||!to||from>to)return [];const out=[];let d=new Date(from.slice(0,7)+'-01T00:00:00Z');while(d.toISOString().slice(0,7)<=to.slice(0,7)){out.push(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
export const inRange=(rows,from,to)=>rows.filter(r=>r.date>=from&&r.date<=to);
export const bucketIndex=(days,buckets)=>Number.isFinite(days)&&days>0?buckets.findIndex(b=>days<=b.max):-1;
export function eligible(r,rate){return Number.isFinite(r[rate])&&Number.isFinite(r.days)&&r.days>0&&(!r.maturity||r.maturity>=r.date)&&(!r.issued||r.issued<=r.date);}
export function series(rows,from,to,rate,buckets){
 return months(from,to).map(month=>{const sample=rows.filter(r=>r.date.startsWith(month)&&r.date<=to&&r.date>=from);const valid=sample.filter(r=>eligible(r,rate));return {month,n:sample.length,nominal:sum(sample),effective:sum(sample,'effective'),rate:weighted(valid,rate),days:weighted(valid,'days'),validN:valid.length,buckets:buckets.map((b,i)=>{const rr=valid.filter(r=>bucketIndex(r.days,buckets)===i);return {n:rr.length,nominal:sum(rr),rate:weighted(rr,rate)};})};});
}
export function curve(rows,from,to,rate,buckets){
 const window=inRange(rows,from,to),valid=window.filter(r=>eligible(r,rate));
 return {from,to,n:window.length,validN:valid.length,excluded:window.length-valid.length,rows:valid,points:buckets.map((b,i)=>{const rr=valid.filter(r=>bucketIndex(r.days,buckets)===i);const total=sum(rr);return {label:b.label,index:i,n:rr.length,days:weighted(rr,'days'),rate:weighted(rr,rate),nominal:total,tradeDays:new Set(rr.map(r=>r.date)).size,maxShare:total?Math.max(...rr.map(r=>r.nominal))/total:null};})};
}
export function cumulative(rows,asof){
 const years=[...new Set(rows.filter(r=>r.date<=asof).map(r=>Number(r.date.slice(0,4))))].sort();
 return years.map(year=>{const cutoff=`${year}-${asof.slice(5)==='02-29'?'02-28':asof.slice(5)}`,yearRows=rows.filter(r=>r.date.slice(0,4)===String(year)&&r.date<=cutoff);let running=0;return {year,n:yearRows.length,values:Array.from({length:12},(_,i)=>{if(i>Number(asof.slice(5,7))-1||!yearRows.length)return null;const m=String(i+1).padStart(2,'0');running+=sum(yearRows.filter(r=>r.date.slice(5,7)===m));return running;})};});
}
export function analyze(all,state){
 const {instrument,channel,asof,windowDays,rate,group}=state,buckets=instrument==='BONOS'?BOND_BUCKETS:SHORT_BUCKETS;
 const universe=all.filter(r=>matchesInstrument(r.instrument,instrument)&&r.channel===channel&&(!group||group==='all'||(group==='jub'?/JUB/i.test(r.decree||''):!/JUB/i.test(r.decree||''))));
 const rows=universe.filter(r=>r.date<=asof),dates=universe.map(r=>r.date).sort();const first=dates[0],last=dates.at(-1);
 const from=shift(asof,1-windowDays),prevTo=shift(from,-1),prevFrom=shift(prevTo,1-windowDays);
 const current=curve(rows,from,asof,rate,buckets),previous=curve(rows,prevFrom,prevTo,rate,buckets);
 const yr=asof.slice(0,4),priorCut=beforeYear(asof),priorYr=priorCut.slice(0,4),ytd=inRange(rows,yr+'-01-01',asof),prior=inRange(rows,priorYr+'-01-01',priorCut);
 // Initial observation is not proof of coverage before the source's first published row.
 const compareStart=first&&first>priorYr+'-01-01'&&first<=priorCut?first:priorYr+'-01-01';
 const currentCompareStart=yr+compareStart.slice(4);
 const ytdComparable=inRange(rows,currentCompareStart,asof),priorComparable=inRange(rows,compareStart,priorCut);
 const yoy=priorComparable.length&&sum(priorComparable)>0?(sum(ytdComparable)/sum(priorComparable)-1)*100:null;
 return {rows,universe,first,last,buckets,current,previous,from,prevTo,prevFrom,ytd,prior,yoy,compareStart,currentCompareStart,
   monthly:series(rows,first,asof,rate,buckets),cumulative:cumulative(rows,asof),nominalYtd:sum(ytd),effectiveYtd:sum(ytd,'effective'),
   rate:weighted(current.rows,rate),prevRate:weighted(previous.rows,rate),days:weighted(current.rows,'days'),recentNominal:sum(inRange(rows,from,asof))};
}
