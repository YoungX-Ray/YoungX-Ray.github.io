(() => {
  'use strict';
  const $ = id => document.getElementById(id), E = window.RBF;
  const embed = new URLSearchParams(location.search).get('embed') === '1';
  if (embed) document.documentElement.classList.add('embedded');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  const fmt = (n, digits = 4) => Math.abs(n) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : n.toFixed(digits);
  const signed = n => `${n >= 0 ? '+' : ''}${fmt(n)}`;
  let model, epoch = 0, selected = 2, running = false, frame = 0, last = 0, fraction = 0, probe = 0.35;
  let weightMax = 1, fitMax = 2, logMin = -5;
  function palette() { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(['ink','muted','line','accent','positive','negative','grid','faint','panel'].map(k => [k, cs.getPropertyValue(`--${k}`).trim()])); }
  const txt = (x, y, t, extra = '') => `<text x="${x}" y="${y}" ${extra}>${t}</text>`;
  function chart(id, xRange, yRange, xLabel, yLabel, xTicks, yTicks, yFormat = v => String(Number(v.toFixed(2)))) {
    const el = $(id), W = Math.max(300, Math.round(el.clientWidth)), H = 265;
    el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.style.aspectRatio = `${W}/${H}`;
    const p = { l: 52, r: 17, t: 24, b: 41 }, c = palette();
    const X = x => p.l + (x - xRange[0]) / (xRange[1] - xRange[0]) * (W - p.l - p.r);
    const Y = y => H - p.b - (y - yRange[0]) / (yRange[1] - yRange[0]) * (H - p.t - p.b);
    let body = txt(p.l, 13, yLabel);
    for (const y of yTicks) body += `<line x1="${p.l}" y1="${Y(y)}" x2="${W-p.r}" y2="${Y(y)}" stroke="${c.grid}"/>` + txt(p.l-7,Y(y)+4,yFormat(y),'text-anchor="end"');
    for (const x of xTicks) body += txt(X(x),H-p.b+20,String(x),'text-anchor="middle"');
    body += `<path d="M${p.l},${p.t}V${H-p.b}H${W-p.r}" fill="none" stroke="${c.line}"/>` + txt(W-p.r,H-3,xLabel,'text-anchor="end"');
    const line = (points, color, width = 2, dash = '', opacity = 1) => `<path d="${points.map(([x,y],i) => `${i?'L':'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''} opacity="${opacity}"/>`;
    return { el, W, H, X, Y, c, line, add: s => { body += s; }, finish: () => { el.innerHTML = body; } };
  }
  function range(n) { return Array.from({ length:n }, (_,i) => -2 + 4*i/(n-1)); }
  function render() {
    const state = model.history[epoch], c = palette(), xs = range(161), chosen = state.w[selected];
    $('epoch').textContent = `${epoch} / ${model.config.epochs}`; $('timeline').value = epoch;
    $('mse').textContent = state.mse.toExponential(3); $('improvement').textContent = `${(100*(1-state.mse/model.history[0].mse)).toFixed(1)}%`;
    $('bias').textContent = signed(state.b); $('step').disabled = epoch >= model.config.epochs;
    $('weights').querySelectorAll('button').forEach((button,j) => {
      const w = state.w[j], percent = 50 * Math.abs(w) / weightMax;
      button.setAttribute('aria-pressed', String(selected===j));
      button.setAttribute('aria-label', `神经元 ${j+1}，输出权重 ${signed(w)}，点击查看`);
      button.querySelector('strong').textContent = signed(w);
      const bar = button.querySelector('.weight-fill'); bar.style.width = `${percent}%`; bar.style.left = `${w<0?50-percent:50}%`; bar.style.background = w<0?c.negative:c.positive;
    });
    const f = chart('fit',[-2,2],[-fitMax,fitMax],'输入 x','输出 y',[-2,-1,0,1,2],[-fitMax,0,fitMax]);
    model.centers.forEach((center,j) => f.add(f.line(xs.map(x => [x,state.w[j]*E.phi(x,center,model.config.sigma)]),j===selected?c.positive:c.faint,j===selected?1.7:1,'',0.45)));
    f.add(f.line(xs.map(x=>[x,E.target(x,model.config.target)]),c.ink,1.8,'6 5'));
    model.xs.forEach((x,i)=>f.add(`<circle cx="${f.X(x)}" cy="${f.Y(model.ys[i])}" r="2.2" fill="${c.ink}" opacity=".5"/>`));
    f.add(f.line(xs.map(x=>[x,E.predict(model,state,x)]),c.accent,3));f.finish();
    const h = chart('history',[0,model.config.epochs],[-weightMax,weightMax],'迭代次数','输出权重 w / 偏置 b',[0,400,800,1200],[-weightMax,0,weightMax]);
    const seen = model.history.filter(s=>s.epoch<=epoch && (s.epoch%5===0 || s.epoch===epoch));
    model.centers.forEach((_,j)=> { if(j!==selected) h.add(h.line(seen.map(s=>[s.epoch,s.w[j]]),c.faint,1.1,'',0.65)); });
    h.add(h.line(seen.map(s=>[s.epoch,s.b]),c.ink,1.3,'4 4',0.6));
    h.add(h.line(seen.map(s=>[s.epoch,s.w[selected]]),c.accent,2.6));
    h.add(`<circle cx="${h.X(epoch)}" cy="${h.Y(chosen)}" r="3.5" fill="${c.accent}"/>`); h.finish();
    const lossTicks = Array.from({length:1-logMin},(_,i)=>logMin+i);
    const l = chart('loss',[0,1200],[logMin,0],'迭代次数','训练 MSE · 对数刻度',[0,400,800,1200],lossTicks,v=>`1e${v}`);
    l.add(l.line(seen.map(s=>[s.epoch,Math.log10(Math.max(10**logMin,s.mse))]),c.accent,2.5));
    l.add(`<circle cx="${l.X(epoch)}" cy="${l.Y(Math.log10(state.mse))}" r="3.5" fill="${c.accent}"/>`);l.finish();
    const center = model.centers[selected], activation=E.phi(probe,center,model.config.sigma), contribution=activation*chosen;
    const basisMax = Math.max(1.15,weightMax);
    const b = chart('basis',[-2,2],[-basisMax,basisMax],'输入 x',`神经元 ${selected+1} · 基函数与贡献`,[-2,-1,0,1,2],[-basisMax,0,basisMax]);
    b.add(b.line(xs.map(x=>[x,E.phi(x,center,model.config.sigma)]),c.ink,2,'5 4'));
    b.add(b.line(xs.map(x=>[x,chosen*E.phi(x,center,model.config.sigma)]),c.accent,2.5));
    b.add(`<line x1="${b.X(probe)}" x2="${b.X(probe)}" y1="${b.Y(-basisMax)}" y2="${b.Y(basisMax)}" stroke="${c.faint}" stroke-dasharray="3 4"/><circle cx="${b.X(probe)}" cy="${b.Y(contribution)}" r="4" fill="${c.accent}"/>`);b.finish();
    $('probe-value').textContent=probe.toFixed(2);
    $('neuron-values').innerHTML = [['中心 cⱼ · 固定',fmt(center,2)],['宽度 σ · 固定',fmt(model.config.sigma,2)],['激活 φⱼ(x) · 随输入',fmt(activation)],['贡献 wⱼφⱼ(x)',signed(contribution)]].map(([label,v])=>`<div>${label}<strong>${v}</strong></div>`).join('');
    const next = chosen-model.config.rate*state.grad[selected];
    $('update').textContent = `w${selected+1}：${fmt(chosen,6)} − ${model.config.rate} × (${fmt(state.grad[selected],6)}) = ${fmt(next,6)}${epoch===1200?'（假设再训练一步）':''}`;
    renderNetwork(state,c);
  }
  function renderNetwork(state,c) {
    const el=$('network'), W=Math.max(300,Math.round(el.clientWidth)), H=295, mid=W*.46, right=W-47, left=33;
    el.setAttribute('viewBox',`0 0 ${W} ${H}`);el.style.aspectRatio=`${W}/${H}`;
    let svg=txt(left,15,'输入','text-anchor="middle"')+txt(mid,15,'高斯神经元','text-anchor="middle"')+txt(right,15,'输出','text-anchor="middle"');
    const ys=model.centers.map((_,j)=>43+j*204/(model.config.count-1));
    ys.forEach((y,j)=> {
      const w=state.w[j], color=w<0?c.negative:c.positive;
      svg+=`<line x1="${left}" y1="148" x2="${mid-15}" y2="${y}" stroke="${c.line}"/><line x1="${mid+15}" y1="${y}" x2="${right}" y2="148" stroke="${color}" stroke-width="${.7+4*Math.abs(w)/weightMax}" opacity="${selected===j?1:.32}"${w<0?' stroke-dasharray="4 2"':''}/>`;
    });
    ys.forEach((y,j)=> {
      const a=E.phi(probe,model.centers[j],model.config.sigma);
      svg+=`<circle cx="${mid}" cy="${y}" r="13" fill="${c.panel}"/><circle cx="${mid}" cy="${y}" r="13" fill="${c.accent}" fill-opacity="${.08+.72*a}" stroke="${selected===j?c.accent:c.line}" stroke-width="${selected===j?2.5:1}"/>`+txt(mid,y+4,String(j+1),`text-anchor="middle" style="fill:${c.ink}"`);
    });
    svg+=`<circle cx="${left}" cy="148" r="18" fill="${c.panel}" stroke="${c.line}"/><circle cx="${right}" cy="148" r="21" fill="${c.panel}" stroke="${c.accent}"/>`+txt(left,153,fmt(probe,1),'text-anchor="middle"')+txt(right,153,'Σ + b','text-anchor="middle"');
    svg+=txt(right,189,`ŷ=${fmt(E.predict(model,state,probe),3)}`,'text-anchor="middle"');
    svg+=txt(W/2,276,'节点深浅 = 激活；连线粗细 = |w|','text-anchor="middle"')+txt(W/2,294,'实线 / + 正权重；虚线 / − 负权重','text-anchor="middle"');el.innerHTML=svg;
  }
  function pause(message='已暂停') { running=false;cancelAnimationFrame(frame);$('play').textContent=epoch===1200?'从头重播':'播放训练';$('status').textContent=message; }
  function tick(time) {
    if(!running)return;
    if(last) fraction+=Math.min((time-last)/1000,.25)*Number($('speed').value);
    last=time;const steps=Math.floor(fraction);
    if(steps){fraction-=steps;epoch=Math.min(1200,epoch+steps);render();}
    if(epoch>=1200){pause('完成 1200 次迭代');return;}frame=requestAnimationFrame(tick);
  }
  function rebuild() {
    pause('第 0 次 · 等待播放');epoch=0;
    model=E.train({count:Number($('count').value),sigma:Number($('sigma').value),rate:Number($('rate').value),target:$('target').value});
    selected=Math.min(selected,model.config.count-1);
    weightMax=Math.ceil(Math.max(1,...model.history.flatMap(s=>[Math.abs(s.b),...s.w.map(Math.abs)]))*1.15*2)/2;
    fitMax=Math.max(1.5,Math.ceil(Math.max(...model.ys.map(Math.abs),...model.history.flatMap(s=>s.w.map(Math.abs))))+.5);
    logMin=Math.min(-2,Math.floor(Math.log10(Math.min(...model.history.map(s=>s.mse)))));
    $('weights').innerHTML=model.centers.map((_,j)=>`<button type="button" class="weight-row" data-neuron="${j}" aria-pressed="${j===selected}"><span>神经元 ${j+1}</span><span class="weight-track"><span class="weight-fill"></span></span><strong></strong></button>`).join('');
    $('neuron').innerHTML=model.centers.map((c,j)=>`<option value="${j}">神经元 ${j+1}</option>`).join('');$('neuron').value=selected;
    $('weights').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{selected=Number(button.dataset.neuron);$('neuron').value=selected;render();}));
    render();$('play').textContent='播放训练';
  }
  ['target','count','sigma','rate'].forEach(id=>$(id).addEventListener('change',rebuild));
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{ $('target').value='wave';$('count').value=b.dataset.preset==='few'?'3':'7';$('sigma').value=b.dataset.preset==='narrow'?'0.18':'0.55';$('rate').value='0.08';rebuild(); }));
  $('play').addEventListener('click',()=>{if(running){pause();return;}if(epoch===1200){epoch=0;render();}running=true;last=0;fraction=0;$('play').textContent='暂停';$('status').textContent='正在训练 · 可随时暂停';frame=requestAnimationFrame(tick);});
  $('step').addEventListener('click',()=>{pause('单步观察');epoch=Math.min(1200,epoch+1);render();});
  $('reset').addEventListener('click',()=>{pause('已回到第 0 次');epoch=0;render();$('play').textContent='播放训练';});
  $('timeline').addEventListener('input',()=>{pause('回看历史');epoch=Number($('timeline').value);render();$('play').textContent=epoch===1200?'从头重播':'播放训练';});
  $('neuron').addEventListener('change',()=>{selected=Number($('neuron').value);render();});
  $('probe').addEventListener('input',()=>{probe=Number($('probe').value);render();});
  $('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';render();});
  $('download').addEventListener('click',()=>{
    const header=['epoch','training_mse','bias',...model.centers.map((_,j)=>`w${j+1}`),'sigma','learning_rate','target',...model.centers.map((_,j)=>`c${j+1}`)];
    const rows=model.history.map(s=>[s.epoch,s.mse,s.b,...s.w,model.config.sigma,model.config.rate,model.config.target,...model.centers]);
    const blob=new Blob(['\uFEFF'+[header,...rows].map(row=>row.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rbf-training-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('status').textContent='已导出完整 0–1200 次训练记录';
  });
  let resizeTimer; window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,100);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause('页面隐藏 · 已暂停');});
  if(embed){
    const origin=location.origin;
    window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==origin)return;if(event.data?.type==='rbf-theme'){document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';render();}});
    let sentHeight=0;new ResizeObserver(()=>{const height=Math.ceil(document.body.scrollHeight);if(height!==sentHeight){sentHeight=height;parent.postMessage({type:'rbf-height',height},origin);}}).observe(document.body);
    parent.postMessage({type:'rbf-ready'},origin);
  }
  rebuild();
})();
