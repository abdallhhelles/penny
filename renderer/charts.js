'use strict';
const NS='http://www.w3.org/2000/svg';
function tipEl(el){let t=$('.tip',el);if(!t){t=document.createElement('div');t.className='tip';el.appendChild(t);}return t;}

/* area / line chart — axis labels on the right, Apple-Health style */
function drawArea(el,pts,o={}){
  const w=el.clientWidth||600,h=o.h||220,m={l:6,r:64,t:14,b:26};
  if(!pts.length){el.innerHTML='';return;}
  const ys=pts.map(p=>p.y).concat(o.band?o.band.lo.map(p=>p.y).concat(o.band.hi.map(p=>p.y)):[]);let min=Math.min(...ys),max=Math.max(...ys);
  if(o.zero){min=Math.min(min,0);max=Math.max(max,0);}
  if(min===max){min-=1;max+=1;}const pr=(max-min)*.14;min-=pr;max+=pr;
  const n=pts.length,X=i=>m.l+i*(w-m.l-m.r)/Math.max(1,n-1),Y=v=>m.t+(1-(v-min)/(max-min))*(h-m.t-m.b);
  let d='';pts.forEach((p,i)=>{const x=X(i),y=Y(p.y);if(!i)d+=`M${x.toFixed(1)},${y.toFixed(1)}`;else{const px=X(i-1),py=Y(pts[i-1].y),cx=(px+x)/2;d+=`C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;}});
  const col=o.color||'var(--accent)',id='g'+uid();
  let grid='';for(let i=0;i<4;i++){const v=min+(max-min)*i/3,y=Y(v);grid+=`<line x1="${m.l}" x2="${w-m.r}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-dasharray="2 5"/><text x="${w-m.r+8}" y="${y+4}">${moneyC(v)}</text>`;}
  let xl='';const k=Math.min(5,n);for(let i=0;i<k;i++){const j=Math.round(i*(n-1)/Math.max(1,k-1));xl+=`<text x="${X(j)}" y="${h-6}" text-anchor="${i===0?'start':i===k-1?'end':'middle'}">${dshort(pts[j].x)}</text>`;}
  let bandPath='';if(o.band&&o.band.lo.length===n){const up=o.band.hi.map((p,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),dn=o.band.lo.map((p,i)=>`L${X(n-1-i).toFixed(1)},${Y(o.band.lo[n-1-i].y).toFixed(1)}`).join('');bandPath=`<path d="${up}${dn}Z" fill="${col}" opacity=".16"><title>80%</title></path>`;}
  const zero=(min<0&&max>0)?`<line x1="${m.l}" x2="${w-m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--red)" stroke-dasharray="4 4" opacity=".7"/>`:'';
  let mk='';if(o.markMin&&o.min){const i=pts.findIndex(p=>p.x===o.min.x);if(i>=0)mk=`<circle cx="${X(i)}" cy="${Y(pts[i].y)}" r="5.5" fill="${pts[i].y<0?'var(--red)':'var(--orange)'}" stroke="#fff" stroke-width="2.5"/>`;}
  el.innerHTML=`<svg width="${w}" height="${h}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".42"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>${grid}${xl}${zero}${bandPath}<path d="${d}L${X(n-1)},${h-m.b}L${X(0)},${h-m.b}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>${mk}<line class="vl" y1="${m.t}" y2="${h-m.b}" stroke="var(--faint)" style="display:none"/><circle class="dot" r="6" fill="${col}" stroke="#fff" stroke-width="2.5" style="display:none"/></svg>`;
  /* the page's scrollbar can appear after the first paint and narrow the card: redraw to the real width so axis labels are never cut off */
  if(!el._ro&&typeof ResizeObserver!=='undefined'){el._ro=new ResizeObserver(()=>{const nw=el.clientWidth;if(nw&&Math.abs(nw-(el._w||0))>2&&el.isConnected){el._ro.disconnect();el._ro=null;drawArea(el,pts,o);}});el._ro.observe(el);}
  el._w=w;
  const svg=$('svg',el),vl=$('.vl',el),dot=$('.dot',el),tip=tipEl(el);
  svg.onmousemove=e=>{const r=svg.getBoundingClientRect();const i=clamp(Math.round((e.clientX-r.left-m.l)/((w-m.l-m.r)/Math.max(1,n-1))),0,n-1);const x=X(i),y=Y(pts[i].y);
    vl.setAttribute('x1',x);vl.setAttribute('x2',x);vl.style.display='';dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.style.display='';
    tip.style.display='block';tip.style.left=x+'px';tip.style.top=y+'px';tip.innerHTML=`<b>${money(pts[i].y)}</b><br><span style="opacity:.65">${dshort(pts[i].x)}</span>`;};
  svg.onmouseleave=()=>{vl.style.display=dot.style.display=tip.style.display='none';};
}

function drawDonut(el,slices,o={}){
  const size=o.size||190,sw=o.sw||20,r=size/2-sw,C=2*Math.PI*r,total=sum(slices,s=>s.value)||1;
  let off=0,arcs='';const gap=slices.length>1?4:0;
  slices.forEach((s,i)=>{const len=s.value/total*C;const dl=Math.max(0.5,len-gap);arcs+=`<circle data-i="${i}" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dl} ${C-dl}" stroke-dashoffset="${-off-gap/2}" transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-width .2s;cursor:pointer"/>`;off+=len;});
  el.innerHTML=`<div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--fill)" stroke-width="${sw}"/>${arcs}</svg><div class="c"><div class="faint" style="font-size:13px" id="dl">${esc(o.label||'Total')}</div><div class="mid amt" id="dv">${money(total)}</div></div></div>`;
  $$('circle[data-i]',el).forEach(c=>{const s=slices[c.dataset.i];
    c.onmouseenter=()=>{c.setAttribute('stroke-width',sw+6);$('#dl',el).textContent=s.label;$('#dv',el).textContent=money(s.value);};
    c.onmouseleave=()=>{c.setAttribute('stroke-width',sw);$('#dl',el).textContent=o.label||'Total';$('#dv',el).textContent=money(total);};});
}

function drawBars(el,groups,series,o={}){
  const w=el.clientWidth||600,h=o.h||220,m={l:6,r:54,t:12,b:26};
  const max=Math.max(1,...groups.flatMap(g=>series.map(s=>g[s.key]||0)))*1.1;
  const gw=(w-m.l-m.r)/groups.length,bw=Math.min(22,gw/(series.length+1.2));
  const Y=v=>m.t+(1-v/max)*(h-m.t-m.b);let s='';
  for(let i=0;i<4;i++){const v=max*i/3,y=Y(v);s+=`<line x1="${m.l}" x2="${w-m.r}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-dasharray="2 5"/><text x="${w-m.r+10}" y="${y+4}">${moneyC(v)}</text>`;}
  groups.forEach((g,gi)=>{const cx=m.l+gw*gi+gw/2;
    series.forEach((se,si)=>{const v=g[se.key]||0,x=cx-(series.length*bw)/2+si*bw+1,y=Y(v),hh=Math.max(0,h-m.b-y);s+=`<rect data-g="${gi}" x="${x}" y="${y}" width="${bw-3}" height="${hh}" rx="${Math.min(bw/2-1.5,8)}" fill="${se.color}"/>`;});
    s+=`<text x="${cx}" y="${h-7}" text-anchor="middle">${esc(g.label)}</text>`;});
  el.innerHTML=`<svg width="${w}" height="${h}">${s}</svg>`;const tip=tipEl(el);
  $$('rect',el).forEach(r=>{r.onmouseenter=()=>{const g=groups[r.dataset.g];tip.style.display='block';tip.style.left=(+r.getAttribute('x')+bw/2)+'px';tip.style.top=r.getAttribute('y')+'px';tip.innerHTML=`<b>${esc(g.label)}</b><br>`+series.map(se=>`<span class="kpi-dot" style="background:${se.color}"></span>${se.label}: ${money(g[se.key]||0)}`).join('<br>');};r.onmouseleave=()=>tip.style.display='none';});
}

function spark(vals,w=120,h=36,color='var(--accent)'){
  if(vals.length<2)return'';let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1;}
  const X=i=>i*(w-2)/(vals.length-1)+1,Y=v=>h-3-(v-min)/(max-min)*(h-6);
  const d=vals.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');const id='s'+uid();
  return`<svg width="${w}" height="${h}" style="display:block"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w-1},${h}L1,${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function ring(p,size=110,stroke=11,color='var(--accent)',inner=''){
  const r=size/2-stroke,C=2*Math.PI*r;
  return`<div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--fill-2)" stroke-width="${stroke}"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C*clamp(p,0,1)} ${C}" transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)"/></svg><div class="c">${inner}</div></div>`;
}
/* concentric "money rings" (like Activity rings) */
function activityRings(rings,size=170){
  const sw=size*0.1,gap=size*0.028;let s='';
  rings.forEach((r,i)=>{const rad=size/2-sw/2-i*(sw+gap),C=2*Math.PI*rad;
    s+=`<circle cx="${size/2}" cy="${size/2}" r="${rad}" fill="none" style="stroke:${r.color}" stroke-opacity=".22" stroke-width="${sw}"/><circle cx="${size/2}" cy="${size/2}" r="${rad}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${Math.max(.01,C*clamp(r.p,0,1))} ${C}" transform="rotate(-90 ${size/2} ${size/2})" style="stroke:${r.color};transition:stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 6px color-mix(in srgb,${r.color} 33%,transparent))"/>`;});
  return`<svg width="${size}" height="${size}">${s}</svg>`;
}
function heatmap(){
  const t=today(),p=periodFor(t),days={};
  for(const x of S.transactions)if(x.type==='expense'&&x.date>=p.start&&x.date<=p.end)days[x.date]=(days[x.date]||0)+x.amount;
  const max=Math.max(1,...Object.values(days));
  const first=pd(p.start).getDay();let h=['S','M','T','W','T','F','S'].map(d=>`<div style="aspect-ratio:auto;height:16px;background:none;font-weight:600;font-size:11px">${d}</div>`).join('');
  for(let i=0;i<first;i++)h+='<div style="background:none"></div>';
  for(let i=0;i<p.days;i++){const d=addDays(p.start,i),v=days[d]||0,a=v?.2+.75*v/max:0,fut=d>t;
    h+=`<div title="${dshort(d)}: ${money(v)}" style="background:${v?`rgba(var(--accent-rgb),${a})`:'var(--fill)'};${fut?'opacity:.35;':''}${d===t?'box-shadow:inset 0 0 0 2px var(--text);':''}${a>.55?'color:#fff;':''}">${pd(d).getDate()}</div>`;}
  return`<div class="heat">${h}</div>`;
}
