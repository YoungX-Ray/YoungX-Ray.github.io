(() => {
 'use strict';
 const E=window.LADRC,$=id=>document.getElementById(id),embedded=new URLSearchParams(location.search).get('embed')==='1';
 if(embedded)document.body.classList.add('embed');
 document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
 const specs=[['wc','控制带宽 ωc',.5,6,.1,'响应目标，rad/s'],['ratio','带宽比 ωo / ωc',1,12,.5,'观察速度与噪声之间的取舍'],['b0','估计输入增益 b₀',.5,8,.1,'用于计算控制量与 ESO'],['b','实际输入增益 b',1,8,.1,'默认 4，对象可产生偏差'],['disturbance','外扰幅值 d',-3,3,.1,'在 t = 6 s 注入，作用于加速度'],['noise','噪声上界 nₘₐₓ',0,.05,.005,'同一双频噪声作用于两者'],['limit','控制限幅 |u| ≤',0,20,.5,'0 表示不限幅，两者同时生效']];
 let current={...E.defaults},result,saved=null,time=6.2,timer;
 const fmt=(x,d=3)=>!Number.isFinite(x)?'—':Math.abs(x)<.5*10**(-d)?'0':Math.abs(x)>=1e5?x.toExponential(2):Number(x.toFixed(d)).toString();
 $('controls').innerHTML=specs.map(([id,label,min,max,step,note])=>`<div class="control"><div class="control-top"><label for="${id}-number">${label}</label><input id="${id}-number" type="number" min="${min}" max="${max}" step="${step}" value="${current[id]}" aria-label="${label}数值"></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${current[id]}" aria-label="${label}滑块"><small>${note}</small></div>`).join('');
 function series(key,color,dash,rows=result.rows){return {key,color,dash,rows};}
 function lineChart(id,items,label,reference=null){
  const width=Math.max(340,Math.round($(id).clientWidth||600)),height=id==='response'?300:255;
  const box={l:52,r:width-18,t:22,b:height-42},values=items.flatMap(s=>s.rows.map(r=>r[s.key]));
  if(reference!==null)values.push(reference);values.push(0);
  let low=Math.min(...values),high=Math.max(...values),span=Math.max(high-low,.1);low-=span*.12;high+=span*.12;
  const x=t=>box.l+(box.r-box.l)*t/current.duration,y=v=>box.b-(box.b-box.t)*(v-low)/(high-low);
  let out=`<title>${label}</title><text x="${box.l}" y="13">${label}</text>`;
  for(let j=0;j<=4;j++){const value=low+(high-low)*j/4,Y=y(value);out+=`<line class="gridline" x1="${box.l}" x2="${box.r}" y1="${Y}" y2="${Y}"/><text text-anchor="end" x="${box.l-8}" y="${Y+4}">${fmt(value,2)}</text>`;}
  for(let j=0;j<=6;j++){const value=current.duration*j/6,X=x(value);out+=`<line class="gridline" x1="${X}" x2="${X}" y1="${box.t}" y2="${box.b}"/><text text-anchor="middle" x="${X}" y="${box.b+21}">${fmt(value,1)}</text>`;}
  if(reference!==null)out+=`<line class="zero-line" x1="${box.l}" x2="${box.r}" y1="${y(reference)}" y2="${y(reference)}"/>`;
  if(current.disturbance!==0){const X=x(current.disturbanceTime);out+=`<line class="event-line" x1="${X}" x2="${X}" y1="${box.t}" y2="${box.b}"/><text x="${X+4}" y="${box.t+13}">加外扰</text>`;}
  for(const s of items){const path=s.rows.map((r,i)=>`${i?'L':'M'}${x(r.t).toFixed(2)},${y(r[s.key]).toFixed(2)}`).join(' ');out+=`<path class="trace" style="stroke:var(--${s.color})" ${s.dash?'stroke-dasharray="'+s.dash+'"':''} d="${path}"/>`;}
  const X=x(time);out+=`<line class="cursor" x1="${X}" x2="${X}" y1="${box.t}" y2="${box.b}"/><text x="${(box.l+box.r)/2}" y="${height-5}" text-anchor="middle">时间 t / s</text>`;
  $(id).setAttribute('viewBox',`0 0 ${width} ${height}`);$(id).innerHTML=out;
 }
 function poles(){
  const width=Math.max(340,Math.round($('poles').clientWidth||450)),height=255,l=52,r=width-20,t=22,b=210,pts=result.poles,g=result.gains;
  const lo=Math.min(-g.wo,-g.wc,...pts.map(p=>p.re)),hi=Math.max(0,...pts.map(p=>p.re)),imax=Math.max(2,...pts.map(p=>Math.abs(p.im)));
  const scale=Math.min((r-l)/Math.max(hi-lo,1)/1.18,(b-t)/(2*imax*1.2)),cx=(hi+lo)/2,cy=(t+b)/2;
  const X=v=>(l+r)/2+(v-cx)*scale,Y=v=>cy-v*scale;
  let out='<title>实际五阶闭环极点与设计位置，坐标比例相同</title>';
  const xmax=cx+(r-l)/(2*scale),xmin=cx-(r-l)/(2*scale),ymax=(b-t)/(2*scale);
  for(let j=0;j<=4;j++){const xv=xmin+(xmax-xmin)*j/4,yv=-ymax+2*ymax*j/4;out+=`<line class="gridline" x1="${X(xv)}" x2="${X(xv)}" y1="${t}" y2="${b}"/><text x="${X(xv)}" y="${b+20}" text-anchor="middle">${fmt(xv,1)}</text><line class="gridline" x1="${l}" x2="${r}" y1="${Y(yv)}" y2="${Y(yv)}"/><text x="${l-8}" y="${Y(yv)+4}" text-anchor="end">${fmt(yv,1)}</text>`;}
  if(X(0)<r&&X(0)>l)out+=`<rect x="${X(0)}" y="${t}" width="${r-X(0)}" height="${b-t}" fill="var(--danger)" opacity=".06"/><line class="zero-line" x1="${X(0)}" x2="${X(0)}" y1="${t}" y2="${b}"/>`;
  out+=`<line class="zero-line" x1="${l}" x2="${r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  for(const [v,label,offset] of [[-g.wc,'−ωc ×2',-13],[-g.wo,'−ωo ×3',23]]){const x=X(v),y=Y(0);out+=`<path d="M${x},${y-6}L${x+6},${y}L${x},${y+6}L${x-6},${y}Z" fill="none" stroke="var(--saved)" stroke-width="1.6"/><text x="${x}" y="${y+offset}" text-anchor="middle">${label}</text>`;}
  for(const p of pts){const x=X(p.re),y=Y(p.im);out+=`<path d="M${x-5},${y-5}L${x+5},${y+5}M${x-5},${y+5}L${x+5},${y-5}" stroke="var(--teal)" stroke-width="2.3"/>`;}
  out+=`<text x="${(l+r)/2}" y="${height-5}" text-anchor="middle">实部 Re(s) / s⁻¹</text><text x="${l}" y="12">虚部 Im(s) / s⁻¹</text>`;
  $('poles').setAttribute('viewBox',`0 0 ${width} ${height}`);$('poles').innerHTML=out;
  $('pole-values').textContent=pts.map(p=>`${fmt(p.re)}${p.im?(p.im>0?' + j':' − j')+fmt(Math.abs(p.im)):''}`).join('；');
 }
 function charts(){
  if(!result)return;
  const outputs=[series('y','teal'),series('yPid','amber','7 4')];if(saved)outputs.push(series('y','saved','3 4',saved.rows));
  lineChart('response',outputs,'输出 y',1);
  lineChart('disturbance-chart',[series('f','truth','6 4'),series('z3','teal'),series('d','saved','2 4')],'加速度等效扰动');
  const inputs=[series('u','teal')];if($('show-pid-u').checked)inputs.push(series('uPid','amber','6 4'));
  lineChart('control-chart',inputs,'实际控制输入 u');
  const velocity=$('state-view').value==='velocity';lineChart('state-chart',[series(velocity?'v':'y','truth','6 4'),series(velocity?'z2':'z1','teal')],velocity?'速度 y′ / z₂':'位置 y / z₁');
  poles();snapshot();
 }
 function snapshot(){
  const r=result.rows[Math.min(result.rows.length-1,Math.round(time/result.sample))],g=result.gains;
  $('time-label').textContent=`t = ${r.t.toFixed(2)} s`;
  const values=[['真实 y',r.y],['估计 z₁',r.z1],['真实速度 y′',r.v],['估计 z₂',r.z2],['真实总扰动 f',r.f],['估计 z₃',r.z3],['外扰 d',r.d],['实际控制 u',r.u]];
  $('snapshot').innerHTML=values.map(([label,value])=>`<div><span>${label}</span><strong>${fmt(value,4)}</strong></div>`).join('');
  $('control-formula').textContent=`u请求 = [${fmt(g.kp)} × (1 − (${fmt(r.z1,4)})) − ${fmt(g.kd)} × (${fmt(r.z2,4)}) − (${fmt(r.z3,4)})] / ${fmt(current.b0)} = ${fmt(r.raw,4)}`;
  $('limit-note').textContent=current.limit?`限幅 ±${fmt(current.limit)} 后，实际 u = ${fmt(r.u,4)}；ESO 使用这个实际输入。`:'未启用限幅，u请求就是实际施加的 u。括号内读数有舍入，内部计算使用完整精度。';
 }
 function rebuild(){
  clearTimeout(timer);$('input-error').textContent='';
  try{result=E.simulate(current);}catch(error){$('input-error').textContent=error.message;return;}
  const g=result.gains;
  $('gains').innerHTML=`ωo = ${fmt(g.wo)} rad/s<strong>kₚ = ${fmt(g.kp)}　k𝒹 = ${fmt(g.kd)}</strong><strong>β₁ = ${fmt(g.beta1)}　β₂ = ${fmt(g.beta2)}　β₃ = ${fmt(g.beta3)}</strong>`;
  const normal=result.stable&&!result.stopped;
  $('status').classList.toggle('unstable',!normal);
  $('status').textContent=result.stopped?'数值已超出观察范围':result.stable?(current.limit?'未饱和线性模型稳定':'线性闭环稳定'):'线性闭环非渐近稳定';
  $('conditions').textContent=`r = 1；b = ${fmt(current.b)}，b₀ = ${fmt(current.b0)}；${current.disturbance?'t = 6 s 加入 d = '+fmt(current.disturbance):'无外加扰动'}；噪声上界 ${fmt(current.noise)}；${current.limit?'两者限幅 ±'+fmt(current.limit):'两者不限幅'}。`;
  const definitions=[['外扰前超调','preDisturbanceOvershoot',' %'],['外扰前进入参考 ±2% 带','preDisturbanceSettling',' s'],['外扰后最大 |1 − y|','peakDeviationAfter',''],['0–12 s 积分绝对误差 IAE','iae',''],['控制量峰值 max|u|','peakControl',''],['末 2 s 控制量标准差','tailControlStd','']];
  $('metrics').innerHTML=definitions.map(([label,key,unit])=>'<tr><td>'+label+'</td>'+['ladrc','pid'].map(kind=>{
   const value=result.metrics?.[kind]?.[key];return `<td>${!normal&&kind==='ladrc'?'—':value===null?'窗口内未收敛':value===undefined?'—':fmt(value,key==='tailControlStd'?5:3)+unit}</td>`;
  }).join('')+'</tr>').join('');
  $('saved-legend').hidden=!saved;$('clear').disabled=!saved;
  if(saved){const c=saved.config;$('saved-note').textContent=`已保存：ωc=${fmt(c.wc)}，ωo/ωc=${fmt(c.ratio)}，b₀=${fmt(c.b0)}，b=${fmt(c.b)}，d=${fmt(c.disturbance)}，噪声=${fmt(c.noise)}，限幅=${fmt(c.limit)}（0 为关闭）。`;}
  else $('saved-note').textContent='';
  charts();
 }
 const presets={tracking:{disturbance:0},disturbance:{},mismatch:{b:2},noise:{noise:.02,ratio:8},saturation:{limit:2}};
 function assign(c){current={...E.defaults,...c};for(const [id] of specs){$(id).value=current[id];$(id+'-number').value=current[id];}rebuild();}
 document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));assign(presets[button.dataset.preset]);}));
 for(const [id,label,min,max] of specs){
  const update=event=>{
   const value=Number(event.target.value);
   if(event.target.value===''||!Number.isFinite(value)||value<min||value>max){$('input-error').textContent=`${label}请填写 ${min}–${max} 之间的数值。`;return;}
   current[id]=value;$(id).value=value;$(id+'-number').value=value;$('input-error').textContent='';
   document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
   clearTimeout(timer);timer=setTimeout(rebuild,90);
  };
  $(id).addEventListener('input',update);$(id+'-number').addEventListener('input',update);
 }
 $('reset').addEventListener('click',()=>{saved=null;time=6.2;$('timeline').value=time;$('show-pid-u').checked=false;$('state-view').value='velocity';document.querySelector('[data-preset="disturbance"]').click();});
 $('timeline').addEventListener('input',()=>{time=Number($('timeline').value);charts();});
 $('show-pid-u').addEventListener('change',charts);$('state-view').addEventListener('change',charts);
 $('save').addEventListener('click',()=>{saved=result;rebuild();});$('clear').addEventListener('click',()=>{saved=null;rebuild();});
 $('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
 $('download').addEventListener('click',()=>{
  const keys=['t','y','yPid','v','z1','z2','f','z3','d','n','u','raw','uPid','upRaw'];
  const header=[...keys,'wc','wo','b0','b','u_limit','pid_kp','pid_ki','pid_kd','pid_filter_s'];
  const rows=result.rows.map(r=>[...keys.map(k=>r[k]),current.wc,result.gains.wo,current.b0,current.b,current.limit,E.pid.kp,E.pid.ki,E.pid.kd,E.pid.tf]);
  const url=URL.createObjectURL(new Blob(['\uFEFF'+[header,...rows].map(r=>r.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='ladrc-pid-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(charts,100);});
 if(embedded){
  const origin=location.origin;let previous=0;
  const height=force=>{const value=Math.ceil(document.body.scrollHeight);if(force||value!==previous){previous=value;parent.postMessage({type:'ladrc-height',height:value},origin);}};
  addEventListener('message',event=>{if(event.source!==parent||event.origin!==origin)return;if(event.data?.type==='ladrc-theme'){document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';requestAnimationFrame(()=>height(true));}});
  new ResizeObserver(()=>height(false)).observe(document.body);parent.postMessage({type:'ladrc-ready'},origin);
 }
 rebuild();
})();
