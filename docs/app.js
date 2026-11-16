import {instrumentGroup,matchesInstrument} from './analisis/analytics.mjs';
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('es-EC',{maximumFractionDigits:2});
const int=new Intl.NumberFormat('es-EC',{maximumFractionDigits:0});
const colors={BONOS:'#007f73',TESORO:'#d55e00'};
const names={BONOS:'Bonos del Estado',TESORO:'CETES / Notas del Tesoro'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=d=>d?d.split('-').reverse().join('/'):'No disponible';
const money=n=>'$ '+fmt.format(n/1e6)+' M';
let data,records=[],filtered=[],tableRows=[],channel='Primario bursátil',page=0;
const sum=(rows,key)=>rows.reduce((s,r)=>s+(r[key]??0),0);
const weighted=(rows,key)=>{const valid=rows.filter(r=>r[key]!==null&&Number.isFinite(r[key]));const denom=sum(valid,'nominal');return denom?sum(valid.map(r=>({w:r[key]*r.nominal})),'w')/denom:null;};
const pct=n=>n===null?'—':fmt.format(n)+' %';

function defaults(){
 const rows=records.filter(r=>r.channel===channel),latest=rows.map(r=>r.date).sort().at(-1);
 $('from').value=latest?latest.slice(0,4)+'-01-01':'';$('to').value=latest??'';
 $('instrument').value='all';$('origin').value='all';$('search').value='';$('only-flags').checked=false;
}
function selectChannel(next){
 channel=next;document.querySelectorAll('[data-channel]').forEach(b=>{const on=b.dataset.channel===channel;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
 $('transactions').hidden=channel==='Instituciones';$('institutions').hidden=channel!=='Instituciones';
 if(channel==='Instituciones'){renderInstitutions();return;}
 $('origin').disabled=channel==='Colocación directa';defaults();render();
}
function render(){
 const from=$('from').value,to=$('to').value,instrument=$('instrument').value,origin=$('origin').value;
 filtered=records.filter(r=>r.channel===channel&&(!from||r.date>=from)&&(!to||r.date<=to)&&matchesInstrument(r.instrument,instrument)&&(origin==='all'||r.origin===origin));
 const secondary=channel==='Secundario bursátil';
 $('nominal-label').textContent=secondary?'Nominal negociado':'Colocación nominal';$('chart-title').textContent=secondary?'Negociación nominal':'Colocación nominal';
 $('scope').textContent=channel==='Colocación directa'?'Colocaciones directas reportadas por BVQ. El archivo no identifica compradores. Se presentan por separado del mercado bursátil por posible solapamiento.':secondary?'Transferencias de títulos existentes: este monto mide actividad del mercado secundario y no representa nuevo financiamiento para el emisor.':'Registros identificados como PRIMARIO en los históricos de BVQ, con procedencias Q y G. Cobertura observada; no equivale a toda la emisión nacional ni al financiamiento neto.';
 const available=records.filter(r=>r.channel===channel&&matchesInstrument(r.instrument,instrument));
 const dates=available.map(r=>r.date).sort();
 $('period-note').textContent=from&&to&&from>to?'El inicio debe ser anterior al final del período.':`Cobertura disponible de este canal: ${pretty(dates[0])} a ${pretty(dates.at(-1))}. Período seleccionado: ${pretty(from)} a ${pretty(to)}. Las cifras incluyen alertas de origen.`;
 $('nominal').textContent=filtered.length?money(sum(filtered,'nominal')):'—';$('effective').textContent=filtered.length?money(sum(filtered,'effective')):'—';$('yield').textContent=pct(weighted(filtered,'yield_pct'));$('count').textContent=int.format(filtered.length);
 $('flag-count').textContent=int.format(filtered.filter(r=>r.flags.length).length)+' registros con alertas';
 renderMonthly();renderMix();page=0;renderTable();
}
function renderMonthly(){
 if(!filtered.length){$('monthly').innerHTML='<div class="empty">No hay registros para esta selección.</div>';return;}
 const groups=new Map();let begin=($('from').value||filtered[0].date).slice(0,7),end=($('to').value||filtered.at(-1).date).slice(0,7);
 let cursor=new Date(begin+'-01T00:00:00Z');let limit=0;
 while(cursor.toISOString().slice(0,7)<=end&&limit++<1200){groups.set(cursor.toISOString().slice(0,7),{BONOS:0,TESORO:0});cursor.setUTCMonth(cursor.getUTCMonth()+1);}
 for(const r of filtered){const key=r.date.slice(0,7);if(!groups.has(key))groups.set(key,{BONOS:0,TESORO:0});groups.get(key)[instrumentGroup(r.instrument)]+=r.nominal/1e6;}
 const entries=[...groups].sort(),W=700,H=250,L=47,R=12,T=15,B=40,w=W-L-R,h=H-T-B;
 const max=Math.max(...entries.map(([,v])=>Object.values(v).reduce((a,b)=>a+b,0)),1)*1.15;
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Montos nominales mensuales, millones de dólares"><title>Montos nominales mensuales. Los valores exactos están disponibles en el CSV.</title>`;
 for(let i=0;i<=4;i++){const y=T+h-i*h/4;svg+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e7ede9"/><text x="${L-8}" y="${y+4}" text-anchor="end" fill="#60747b" font-size="10">${fmt.format(max*i/4)}</text>`;}
 const slot=w/entries.length,bw=Math.min(35,slot*.64),every=Math.max(1,Math.ceil(entries.length/12));
 entries.forEach(([month,v],idx)=>{let y=T+h;for(const key of ['BONOS','TESORO']){const bh=v[key]/max*h;y-=bh;svg+=`<rect x="${L+slot*(idx+.5)-bw/2}" y="${y}" width="${bw}" height="${bh}" fill="${colors[key]}"><title>${month} · ${names[key]}: ${fmt.format(v[key])} millones USD</title></rect>`;}if(idx%every===0){const label=entries.length>12?month.slice(2):['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(month.slice(5))-1];svg+=`<text x="${L+slot*(idx+.5)}" y="${H-17}" text-anchor="middle" fill="#60747b" font-size="10">${label}</text>`;}});
 $('monthly').innerHTML=svg+'</svg>';
}
function renderMix(){const total=sum(filtered,'nominal');$('mix').innerHTML=Object.keys(colors).map(key=>{const rows=filtered.filter(r=>matchesInstrument(r.instrument,key)),value=sum(rows,'nominal');return `<div class="mix-row"><div class="mix-title"><span>${names[key]}</span><strong>${rows.length?money(value):'Sin registros'}</strong></div><div class="track"><div class="fill" style="background:${colors[key]};width:${total?100*value/total:0}%"></div></div><div class="mix-stats"><span>${rows.length?fmt.format(value/total*100)+' % del nominal':'—'}</span><span>Rend. ${pct(weighted(rows,'yield_pct'))}</span></div></div>`;}).join('');}
function renderTable(){
 const query=$('search').value.toLowerCase();tableRows=filtered.filter(r=>(!$('only-flags').checked||r.flags.length)&&(!query||[r.date,r.issuer,r.decree,r.instrument,r.sheet].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(tableRows.length/25));page=Math.min(page,pages-1);$('page').textContent=`${page+1} / ${pages}`;$('prev').disabled=page===0;$('next').disabled=page===pages-1;$('table-count').textContent=int.format(tableRows.length)+' registros en la tabla';
 $('rows').innerHTML=tableRows.slice(page*25,(page+1)*25).map(r=>`<tr><td>${pretty(r.date)}</td><td><span class="tag ${r.instrument}">${r.instrument}</span></td><td class="numeric">${fmt.format(r.nominal)}</td><td class="numeric">${fmt.format(r.effective)}</td><td class="numeric">${pct(r.yield_pct)}</td><td class="numeric">${pct(r.price_pct)}</td><td class="numeric">${r.days===null?'—':int.format(r.days)}</td><td>${esc(r.origin||'No informada')}</td><td class="source-cell">${esc(r.sheet)} · fila ${r.row}<br>${esc(r.decree||r.source)}</td><td class="flag">${r.flags.length?esc(r.flags.join('; ')):'—'}</td></tr>`).join('')||'<tr><td colspan="10" class="empty">No hay registros. Ajusta el período o los filtros.</td></tr>';
}
function renderInstitutions(){const report=data.institutions[Number($('institution-period').value)];$('institution-dates').textContent=report.period_start+' · '+report.period_end;$('institution-rows').innerHTML=[...report.entries].sort((a,b)=>b.effective-a.effective).map(r=>`<tr><td>${esc(r.institution)}</td><td>${esc(r.code)}</td>${['quito','guayaquil','effective','adjusted'].map(k=>`<td class="numeric">${fmt.format(r[k])}</td>`).join('')}</tr>`).join('');$('institution-total').innerHTML=`<tr><td colspan="4">Total nacional del reporte</td><td class="numeric">${fmt.format(report.total)}</td><td class="numeric">${fmt.format(sum(report.entries,'adjusted'))}</td></tr>`;}
function renderSources(){
 const checked=new Date(data.checked_at);$('checked').textContent='Consulta: '+checked.toLocaleString('es-EC',{timeZone:'America/Guayaquil',dateStyle:'medium',timeStyle:'short'});
 const historical=data.sources.find(s=>s.file==='bonos.xls'),direct=data.sources.find(s=>s.file.endsWith('xlsx'));
 const age=Math.floor((Date.now()-checked.getTime())/86400000);
 $('coverage').textContent=`Históricos: ${pretty(historical.last_date)}. Directas: ${pretty(direct.last_date)}.`+(age>2?` La última consulta tiene ${age} días; revisar actualización.`:' Cada fuente tiene su propio corte.');
 $('source-list').innerHTML=data.sources.map(s=>`<article class="source-card"><strong>${esc(s.file)}</strong><p>${s.last_date?`${int.format(s.rows)} registros · ${pretty(s.first_date)} a ${pretty(s.last_date)}`:'Reporte agregado por institución; período indicado en su tabla.'}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Excel oficial ↗</a> · <a href="${esc(s.page)}" target="_blank" rel="noopener">Página BVQ ↗</a><p><code>SHA-256 ${esc(s.sha256)}</code></p></article>`).join('');
 $('quality-summary').textContent=`Controles de calidad · ${data.quality.possible_overlap_groups} grupos con posible coincidencia entre fuentes`;
 $('quality').innerHTML='<p>Las coincidencias son candidatas, no duplicados confirmados. Las filas idénticas se conservan porque pueden corresponder a operaciones distintas. Las diferencias monetarias son alertas de revisión, no correcciones automáticas.</p><ul>'+Object.entries(data.quality.flag_counts).map(([label,count])=>`<li>${esc(label)}: ${int.format(count)} registros</li>`).join('')+'</ul><p>Fuera del alcance de los indicadores:</p><ul>'+data.quality.excluded.map(r=>`<li>${esc(r.reason)} · ${pretty(r.date)} · ${money(r.amount)} · ${esc(r.sheet)}, fila ${r.row}</li>`).join('')+'</ul>';
}
function downloadCSV(){
 const cell=v=>{let s=Array.isArray(v)?v.join('; '):String(v??'');if(/^[=+@\-]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const text='\ufeff'+[data.columns.join(','),...tableRows.map(r=>data.columns.map(k=>cell(r[k])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ecuador-'+channel.toLowerCase().replaceAll(' ','-')+'.csv';a.click();URL.revokeObjectURL(url);
}
try{
 const response=await fetch('data/dashboard.json',{cache:'no-cache'});if(!response.ok)throw new Error('HTTP '+response.status);data=await response.json();records=data.rows.map(row=>Object.fromEntries(data.columns.map((key,i)=>[key,row[i]])));
 renderSources();defaults();render();
 document.querySelectorAll('[data-channel]').forEach(b=>b.addEventListener('click',()=>selectChannel(b.dataset.channel)));
 for(const id of ['instrument','from','to','origin'])$(id).addEventListener('change',render);
 $('reset').addEventListener('click',()=>{defaults();render();});
 for(const id of ['search','only-flags'])$(id).addEventListener('input',()=>{page=0;renderTable();});
 $('prev').addEventListener('click',()=>{page--;renderTable();});$('next').addEventListener('click',()=>{page++;renderTable();});$('export').addEventListener('click',downloadCSV);$('institution-period').addEventListener('change',renderInstitutions);
}catch(error){$('error').hidden=false;$('error').textContent='No se pudo cargar la base. Abre el dashboard desde su servidor web y revisa la última ejecución de GitHub Actions. Detalle: '+error.message;$('checked').textContent='Carga incompleta';}
