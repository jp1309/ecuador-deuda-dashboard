// Render the actual chart configurations without a browser. This does not verify CSS layout or browser interactions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),engine=require('../docs/analisis/vendor/echarts.min.js');
engine.setPlatformAPI({createCanvas:()=>({getContext:()=>null})});
const data=JSON.parse(readFileSync(new URL('../docs/data/dashboard.json',import.meta.url),'utf8'));
const elements=new Map(),renders=new Map(),instances=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',hidden:false,options:[{},{}],checked:true,dataset:{},handlers:{},classList:{toggle(){}},setAttribute(){},addEventListener(event,fn){this.handlers[event]=fn;}});return elements.get(id);}
const buttons=['BONOS','TESORO'].map(instrument=>{const el=element('button-'+instrument);el.dataset.instrument=instrument;return el;});
const moneyButtons=['nominal','effective'].map(money=>{const el=element('money-'+money);el.dataset.money=money;return el;});
globalThis.document={getElementById:element,querySelectorAll:selector=>selector==='[data-instrument]'?buttons:selector==='[data-money]'?moneyButtons:[]};
globalThis.IntersectionObserver=class{observe(){}};
globalThis.fetch=async()=>({ok:true,json:async()=>data});
globalThis.echarts={init(el){const width=el.id==='shift-chart'?360:780;const height=el.id==='heatmap'?260:350;const c=engine.init(null,null,{renderer:'svg',ssr:true,width,height});instances.set(el.id,c);return {setOption(option){c.setOption({...option,animation:false,aria:{enabled:false}},true);const svg=c.renderToSVGString();assert.ok(svg.startsWith('<svg'),el.id);assert.ok(!svg.includes('NaN'),el.id+' contains NaN');renders.set(el.id,svg);},dispose(){c.dispose();instances.delete(el.id);renders.delete(el.id);},resize(){}};}};
globalThis.window={innerWidth:1440,echarts:globalThis.echarts,addEventListener(){}};
element('channel').value='Primario bursátil';element('window').value='30';element('rate').value='tea_pct';element('group').value='all';element('institution-period').value='0';
test('chart rendering and UI state computation across instruments and channels',async()=>{
 await import('../docs/analisis/app.mjs');
 if(element('updated').textContent==='Carga incompleta'){for(const c of instances.values())c.dispose();assert.fail(element('error').textContent);}
 assert.equal(renders.size,9);
 const sourceRows=data.rows.map(r=>Object.fromEntries(data.columns.map((k,i)=>[k,r[i]])));
 const cutoff=data.sources.find(s=>s.file==='bonos.xls').last_date;
 const expected=sourceRows.filter(r=>r.instrument==='BONOS'&&r.channel==='Primario bursátil'&&r.date>=cutoff.slice(0,4)+'-01-01'&&r.date<=cutoff).reduce((s,r)=>s+r.nominal,0);
 const annual=instances.get('cumulative-chart').getOption().series.find(series=>series.name===cutoff.slice(0,4));
 const lastMonth=Number(cutoff.slice(5,7))-1;
 assert.ok(Math.abs(annual.data[lastMonth]*1e6-expected)<.01);
 if(process.env.RENDER_DIR){mkdirSync(process.env.RENDER_DIR,{recursive:true});for(const [name,svg] of renders)writeFileSync(process.env.RENDER_DIR+'/'+name+'.svg',svg);}
 // Both sets of controls must drive the same date ranges, including year boundaries.
 element('curve-asof').value='2019-04-01';element('curve-asof').handlers.change();
 element('curve-window').value='90';element('curve-window').handlers.change();
 assert.equal(element('asof').value,'2019-04-01');
 assert.equal(element('window').value,'90');
 assert.equal(element('curve-current-range').textContent,'02/01/2019 al 01/04/2019');
 assert.equal(element('curve-previous-range').textContent,'04/10/2018 al 01/01/2019');
 assert.equal(element('curve-previous-sample').textContent,'Sin registros en el período');
 element('window').value='30';element('window').handlers.change();
 assert.equal(element('curve-window').value,'30');
 for(const channel of ['Primario bursátil','Secundario bursátil','Colocación directa']){
  element('channel').value=channel;element('channel').handlers.change();
  for(const button of buttons){button.handlers.click();assert.notEqual(element('updated').textContent,'Carga incompleta',element('error').textContent);assert.ok(renders.has('volume-chart'));}
 }
 // A sparse source can yield an observed plot or a transparent empty-state, never a manufactured line.
 assert.ok(renders.has('curve-chart')||element('curve-chart').innerHTML.includes('No hay registros válidos'));
 element('channel').value='Primario bursátil';element('channel').handlers.change();buttons[1].handlers.click();
 const ceteDates=sourceRows.filter(r=>['CETES','NOTAS'].includes(r.instrument)&&r.channel==='Primario bursátil').map(r=>r.date).sort();
 const ceteCut=data.sources.find(s=>s.file==='cetes.xls').last_date;
 const gap=(new Date(ceteCut)-new Date(ceteDates.at(-1)))/86400000;
 assert.equal(element('stale').hidden,gap<30);
 if(gap>=30){assert.equal(element('curve-current-sample').textContent,'Sin registros en el período');element('last-date').handlers.click();assert.equal(element('stale').hidden,true);}
 element('curve-asof').value='2020-12-31';element('curve-asof').handlers.change();
 assert.ok(renders.has('curve-chart'));
 assert.match(element('curve-current-sample').textContent,/registros? v.lidos?/);
 element('asof').value='2018-01-01';element('asof').handlers.change();assert.ok(element('volume-chart').innerHTML.includes('Sin registros'));
 for(const c of instances.values())c.dispose();
});
