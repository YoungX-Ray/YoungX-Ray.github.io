/* Offline, dependency-free interactive control laboratory. */
(() => {
  'use strict';
  const M = window.PIDMath;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const defaults = { kp: 1, ki: 0, kd: 0 };
  let gains = { ...defaults }, pinned = null, appliedTarget = null, selectedPreset = 'p';
  let computed, renderFrame = 0;
  const presets = {
    p: { gains: defaults, note: '先观察：只有比例控制时，输出不能到达 1。' },
    pd: { gains: { kp: 1.25, ki: 0, kd: 0.75 }, note: '加入微分后，极点为 −2.1 ± j2.142；仍有稳态误差。' },
    pi: { gains: { kp: 2, ki: 1, kd: 0 }, note: '积分消除阶跃稳态误差，但带来第三个极点。' },
    pid: { gains: { kp: 9.65, ki: 18, kd: 2.75 }, note: '配置目标：−2.1 ± j2.142、−8。零点也会影响超调。' },
    unstable: { gains: { kp: 1, ki: 5, kd: 0 }, note: '两个极点进入右半平面，响应振荡发散。试着增大 Kd。' }
  };
  const baseRange = { kp: [0, 30], ki: [0, 60], kd: [0, 8] };
  const finiteGains = v => v && ['kp', 'ki', 'kd'].every(k => Number.isFinite(v[k]) && Math.abs(v[k]) <= 1000);
  try {
    const saved = JSON.parse(localStorage.getItem('second-order-pid-v1') || 'null');
    if (saved && finiteGains(saved.gains)) {
      gains = saved.gains; selectedPreset = null;
      if (finiteGains(saved.pinned)) pinned = saved.pinned;
    }
  } catch (_) { /* File URLs and private browsing can deny local storage. */ }
  const save = () => { try { localStorage.setItem('second-order-pid-v1', JSON.stringify({ gains, pinned })); } catch (_) {} };
  function format(n, digits = 3) {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    if (Math.abs(n) >= 1e5 || Math.abs(n) < .0001) return n.toExponential(2).replace('-', '−');
    return Number(n.toFixed(digits)).toString().replace('-', '−');
  }
  function complex(p) { return Math.abs(p.im) < 1e-8 ? format(p.re) : `${format(p.re)} ${p.im < 0 ? '−' : '+'} j${format(Math.abs(p.im))}`; }
  function polynomial(coefficients) {
    return coefficients.map((n, i) => {
      if (n === 0) return '';
      const power = coefficients.length - 1 - i;
      const term = `${Math.abs(n) === 1 && power ? '' : format(Math.abs(n), 4)}${power === 3 ? 's³' : power === 2 ? 's²' : power === 1 ? 's' : ''}`;
      return { term, negative: n < 0 };
    }).filter(Boolean).map((v, i) => `${v.negative ? (i ? ' − ' : '−') : (i ? ' + ' : '')}${v.term}`).join('') || '0';
  }
  function syncControls() {
    for (const key of ['kp', 'ki', 'kd']) {
      $(key).min = Math.min(baseRange[key][0], Math.floor(gains[key]));
      $(key).max = Math.max(baseRange[key][1], Math.ceil(gains[key]));
      $(key).value = gains[key]; $(key + '-number').value = Number(gains[key].toFixed(6));
    }
    document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === selectedPreset)));
    $('pin-legend').hidden = !pinned; $('clear-pin').hidden = !pinned;
  }
  function targetValues() {
    const inputs = ['zeta', 'wn', 'third'];
    if (!inputs.every(id => $(id).value !== '' && $(id).checkValidity())) return null;
    return { zeta: Number($('zeta').value), wn: Number($('wn').value), p: Number($('third').value) };
  }
  function targetPoles(target) {
    const { zeta: z, wn: w, p } = target;
    const sigma = -z * w;
    if (z <= 1) return [{ re: sigma, im: w * Math.sqrt(1-z*z) }, { re: sigma, im: -w * Math.sqrt(1-z*z) }, { re: -p, im: 0 }];
    return [{ re: sigma + w * Math.sqrt(z*z-1), im: 0 }, { re: sigma - w * Math.sqrt(z*z-1), im: 0 }, { re: -p, im: 0 }];
  }
  function previewTarget() {
    const target = targetValues();
    $('target-preview').textContent = target ? targetPoles(target).map(complex).join(' ； ') : '请在标示范围内填写三个目标参数。';
    $('place').disabled = !target;
  }
  function changed() { syncControls(); save(); schedule(true); }
  for (const key of ['kp', 'ki', 'kd']) {
    for (const id of [key, key + '-number']) {
      $(id).addEventListener('input', () => {
        const input = $(id), value = Number(input.value);
        if (input.value === '' || !Number.isFinite(value) || Math.abs(value) > 1000) { $('input-error').textContent = '请输入 −1000 到 1000 之间的有限增益；图中保留上次有效结果。'; return; }
        $('input-error').textContent = '';
        gains[key] = value; selectedPreset = null; appliedTarget = null;
        $('preset-note').textContent = '自由调节中。观察极点、零点、稳态误差和振荡的联动。';
        // Do not replace a focused numeric input while the user is typing decimals.
        $(key).min = Math.min(baseRange[key][0], Math.floor(value)); $(key).max = Math.max(baseRange[key][1], Math.ceil(value));
        $(key).value = value;
        if (id === key) $(key + '-number').value = value;
        document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        save(); schedule(true);
      });
    }
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    selectedPreset = button.dataset.preset;
    gains = { ...presets[selectedPreset].gains };
    appliedTarget = selectedPreset === 'pid' ? { zeta: .7, wn: 3, p: 8 } : null;
    if (appliedTarget) { $('zeta').value = .7; $('wn').value = 3; $('third').value = 8; previewTarget(); }
    $('input-error').textContent = ''; $('preset-note').textContent = presets[selectedPreset].note;
    changed();
  }));
  ['zeta', 'wn', 'third'].forEach(id => $(id).addEventListener('input', previewTarget));
  $('place').addEventListener('click', () => {
    const target = targetValues(); if (!target) return;
    gains = M.place(target); appliedTarget = target; selectedPreset = null;
    $('input-error').textContent = '';
    $('preset-note').textContent = '已按目标多项式匹配 PID。图中菱形为应用的目标，叉号为计算得到的特征根。' + (Object.values(gains).some(v => v < 0) ? ' 此目标需要负增益。' : '');
    changed();
  });
  $('pin').addEventListener('click', () => { pinned = { ...gains }; changed(); });
  $('clear-pin').addEventListener('click', () => { pinned = null; changed(); });
  ['duration', 'locus-max'].forEach(id => $(id).addEventListener('change', () => schedule(true)));
  function el(tag, attributes = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function extent(values, references = []) {
    let lo = Infinity, hi = -Infinity;
    for (const v of [...values, ...references]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) return [-1, 1];
    const pad = Math.max((hi-lo)*.1, .1);
    return [lo-pad, hi+pad];
  }
  function ticks(lo, hi, count) {
    const raw = (hi-lo) / count, power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw/power, step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10)*power;
    const result = [];
    for (let n = Math.ceil(lo/step)*step; n <= hi + step*1e-6 && result.length < 20; n += step) result.push(Math.abs(n) < step*1e-8 ? 0 : n);
    return result;
  }
  function frame(svg, domains, options = {}) {
    const width = Math.max(240, svg.getBoundingClientRect().width), height = svg.getBoundingClientRect().height || 240;
    const box = { left: 60, right: width-15, top: 15, bottom: height-43 };
    let [xmin, xmax] = domains.x, [ymin, ymax] = domains.y;
    if (options.equal) {
      const unit = Math.max((xmax-xmin)/(box.right-box.left), (ymax-ymin)/(box.bottom-box.top));
      const cx=(xmin+xmax)/2, cy=(ymin+ymax)/2;
      xmin=cx-unit*(box.right-box.left)/2; xmax=cx+unit*(box.right-box.left)/2;
      ymin=cy-unit*(box.bottom-box.top)/2; ymax=cy+unit*(box.bottom-box.top)/2;
    }
    svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.append(el('title', {}, svg.getAttribute('aria-label')));
    const x = n => box.left+(n-xmin)/(xmax-xmin)*(box.right-box.left);
    const y = n => box.bottom-(n-ymin)/(ymax-ymin)*(box.bottom-box.top);
    const defs = el('defs'), clip = el('clipPath', { id: `${svg.id}-clip` });
    clip.append(el('rect', { x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top })); defs.append(clip); svg.append(defs);
    if(options.equal && xmax>0) svg.append(el('rect', { x: x(Math.max(0,xmin)), y:box.top,width:box.right-x(Math.max(0,xmin)),height:box.bottom-box.top,fill:'var(--right)' }));
    const nx=width<400?3:6;
    ticks(xmin,xmax,nx).forEach(t=>{svg.append(el('line',{x1:x(t),x2:x(t),y1:box.top,y2:box.bottom,class:'grid'}));svg.append(el('text',{x:x(t),y:box.bottom+18,'text-anchor':'middle'},format(t,2)));});
    ticks(ymin,ymax,4).forEach(t=>{svg.append(el('line',{x1:box.left,x2:box.right,y1:y(t),y2:y(t),class:'grid'}));svg.append(el('text',{x:box.left-9,y:y(t)+4,'text-anchor':'end'},format(t,2)));});
    svg.append(el('rect',{x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top,fill:'none',class:'axis','data-chart-frame':'true'}));
    if(xmin<0&&xmax>0)svg.append(el('line',{x1:x(0),x2:x(0),y1:box.top,y2:box.bottom,class:'zero-axis'}));
    if(ymin<0&&ymax>0)svg.append(el('line',{x1:box.left,x2:box.right,y1:y(0),y2:y(0),class:'zero-axis'}));
    svg.append(el('text',{x:(box.left+box.right)/2,y:height-7,'text-anchor':'middle',class:'axis-title','data-axis':'x'},options.equal?'实部 Re(s) / s⁻¹':'时间 t / s'));
    const cy=(box.top+box.bottom)/2;
    svg.append(el('text',{x:13,y:cy,transform:`rotate(-90 13 ${cy})`,'text-anchor':'middle',class:'axis-title','data-axis':'y'},options.equal?'虚部 Im(s) / rad·s⁻¹':'输出 y / 归一化'));
    const marks=el('g',{'clip-path':`url(#${svg.id}-clip)`});svg.append(marks);
    return {svg,width,height,box,x,y,marks,xmin,xmax,ymin,ymax};
  }
  function path(chart, values, className, xKey='t', yKey='y') {
    const d=values.filter(p=>Number.isFinite(p[xKey])&&Number.isFinite(p[yKey])).map((p,i)=>`${i?'L':'M'}${chart.x(p[xKey]).toFixed(2)},${chart.y(p[yKey]).toFixed(2)}`).join(' ');
    const element=el('path',{d,class:className});chart.marks.append(element);return element;
  }
  function marker(chart, point, type, className, label) {
    const x=chart.x(point.re),y=chart.y(point.im),r=type==='target'?8:5;
    const mark=type==='cross'?el('path',{d:`M${x-r},${y-r}L${x+r},${y+r}M${x-r},${y+r}L${x+r},${y-r}`,class:className}):type==='target'?el('path',{d:`M${x},${y-r}L${x+r},${y}L${x},${y+r}L${x-r},${y}Z`,class:className}):el('circle',{cx:x,cy:y,r:type==='dot'?4.5:4.5,class:className});
    mark.append(el('title',{},`${label}: ${complex(point)}`));chart.marks.append(mark);
  }
  function drawStep() {
    const {current,plant,comparison,duration,analysis}=computed;
    const domain=extent([...current.data,...plant.data,...(comparison?.data||[])].map(p=>p.y),[0,1]);
    const chart=frame($('step-chart'),{x:[0,duration],y:domain});
    if(analysis.stable&&analysis.finalValue>0){const f=analysis.finalValue;chart.marks.append(el('rect',{x:chart.box.left,y:chart.y(f*1.02),width:chart.box.right-chart.box.left,height:chart.y(f*.98)-chart.y(f*1.02),fill:'var(--blue)',opacity:'.045'}));}
    path(chart,[{t:0,y:1},{t:duration,y:1}],'reference-path');path(chart,plant.data,'plant-path');
    if(comparison)path(chart,comparison.data,'pin-path');path(chart,current.data,'current-path');
    const guide=el('line',{y1:chart.box.top,y2:chart.box.bottom,stroke:'var(--neutral)','stroke-dasharray':'3 3',visibility:'hidden'});chart.marks.append(guide);
    const overlay=el('rect',{x:chart.box.left,y:chart.box.top,width:chart.box.right-chart.box.left,height:chart.box.bottom-chart.box.top,fill:'transparent','data-chart-hit':'true'});chart.svg.append(overlay);
    const interpolate=(data,t)=>{if(!data.length||t>data.at(-1).t)return null;if(data.length===1)return data[0].y;const index=Math.min(data.length-2,Math.max(0,Math.floor(t/data.at(-1).t*(data.length-1))));const a=data[index],b=data[index+1];return a.y+(b.y-a.y)*(t-a.t)/(b.t-a.t);};
    overlay.addEventListener('pointermove',event=>{
      const rect=chart.svg.getBoundingClientRect(),cx=Math.max(chart.box.left,Math.min(chart.box.right,event.clientX-rect.left));
      const time=(cx-chart.box.left)/(chart.box.right-chart.box.left)*duration;
      guide.setAttribute('x1',cx);guide.setAttribute('x2',cx);guide.setAttribute('visibility','visible');
      const tip=$('step-tooltip');tip.replaceChildren();
      const rows=[`t = ${format(time)} s`,`当前闭环：${format(interpolate(current.data,time))}`,`原对象：${format(interpolate(plant.data,time))}`];
      if(comparison)rows.push(`固定对照：${format(interpolate(comparison.data,time))}`);
      rows.forEach(row=>{const div=document.createElement('div');div.textContent=row;tip.append(div);});
      tip.hidden=false;tip.style.left=`${Math.max(4,Math.min(cx+12,chart.width-tip.offsetWidth-4))}px`;tip.style.top='18px';
    });
    overlay.addEventListener('pointerleave',()=>{guide.setAttribute('visibility','hidden');$('step-tooltip').hidden=true;});
  }
  function planeDomains(points) {return {x:extent(points.map(p=>p.re),[0]),y:extent(points.map(p=>p.im),[0])};}
  function drawPoles() {
    const {analysis}=computed,targets=appliedTarget?targetPoles(appliedTarget):[];
    const chart=frame($('pole-chart'),planeDomains([...analysis.poles,...analysis.zeros,...targets]),{equal:true});
    targets.forEach(p=>marker(chart,p,'target','target-mark','配置目标'));
    analysis.zeros.forEach(p=>marker(chart,p,'circle','zero-mark','闭环零点'));
    analysis.poles.forEach(p=>marker(chart,p,'cross','pole-mark','闭环特征根'));
    $('target-legend').hidden=!targets.length;
  }
  function drawLocus() {
    const {locus,analysis}=computed;
    const points=[...locus.branches.flat(),...locus.openPoles,...locus.openZeros,...analysis.poles];
    const chart=frame($('locus-chart'),planeDomains(points),{equal:true});
    locus.branches.forEach(branch=>path(chart,branch,'locus-path','re','im'));
    locus.openZeros.forEach(p=>marker(chart,p,'circle','open-zero','开环零点'));
    locus.openPoles.forEach(p=>marker(chart,p,'cross','open-pole','开环极点 κ→0'));
    analysis.poles.forEach(p=>marker(chart,p,'dot','root-current','当前 κ=1'));
  }
  function updateLabels() {
    const {analysis:a,current,duration}=computed;
    const types=[gains.kp!==0?'P':'',gains.ki!==0?'I':'',gains.kd!==0?'D':''].join('');
    $('controller-name').textContent=types?`${types} 控制`:'控制器输出为零';
    $('order-label').textContent=gains.ki===0?'二阶特征多项式':'三阶特征多项式';
    // Do not hide a very slow unstable mode behind an arbitrary real-part tolerance.
    const doubleOrigin=a.denominator.length===3&&a.denominator[1]===0&&a.denominator[2]===0;
    const rightHalfPlane=a.status==='unstable'&&!doubleOrigin;
    $('stability').textContent={stable:'稳定 · 极点均在左半平面',marginal:'临界 / 非渐近稳定',unstable:rightHalfPlane?'不稳定 · 存在右半平面根':'不稳定 · 虚轴重根'}[a.status]||a.status;
    $('stability').className=a.status;
    $('error-value').textContent=a.stable?format(1-a.finalValue,4):'无稳态值';
    const f=a.finalValue, validMetrics=a.stable&&Math.abs(f)>1e-8&&!current.truncated;
    let settling=null,overshoot=null;
    if(validMetrics){
      if(f>0)overshoot=Math.max(0,(Math.max(...current.data.map(p=>p.y))-f)/Math.abs(f)*100);
      let lastOutside=-1;current.data.forEach((p,i)=>{if(Math.abs(p.y-f)>.02*Math.abs(f))lastOutside=i;});
      if(lastOutside<current.data.length-2){const index=lastOutside+1;const candidate=current.data[index].t;if(candidate<duration-Math.max(.25,duration*.05))settling=candidate;}
    }
    $('overshoot-value').textContent=overshoot===null?'不适用':`${format(overshoot,1)}%`;
    $('settling-value').textContent=settling===null?(a.stable?(Math.abs(f)<=1e-8?'不适用':'窗口内未确认'):'不收敛'):`≈ ${format(settling,2)} s`;
    const note=[];
    if(a.stable)note.push(`理论终值 y∞ = ${format(f,4)}。超调和调节时间按 ${duration} s 窗口采样估计。`);
    else note.push(a.status==='unstable'?(rightHalfPlane?'右半平面极点使响应发散；延长时间窗可观察幅值增长。':'虚轴重根可引起随时间增长的响应，不能使用渐近稳定系统的稳态指标。'):'极点位于稳定边界，不能使用渐近稳定系统的稳态指标。');
    if(current.truncated)note.push('数值增长超过显示上限，曲线已提前停止。');
    if(settling===null&&a.stable&&validMetrics)note.push('可延长时间窗检查收敛。');
    if(gains.kp===0&&gains.ki===0&&gains.kd===0)note.push('零输入下 y 恒为 0；特征根仍描述对象内部模态。');
    if(pinned)note.push(`固定对照：Kp=${format(pinned.kp)}，Ki=${format(pinned.ki)}，Kd=${format(pinned.kd)}。`);
    $('response-note').textContent=note.join(' ');
    $('pole-values').replaceChildren(...a.poles.map((p,i)=>{const span=document.createElement('span');span.textContent=`p${i+1} = ${complex(p)}`;return span;}));
    $('transfer').textContent=`(${polynomial(a.numerator)}) / (${polynomial(a.denominator)})`;
    $('model-note').textContent=gains.ki===0?'Ki = 0：已约去人为引入的 s 因子；特殊零极点相消未另行约分。':'Ki ≠ 0：保留三阶特征多项式；特殊零极点相消未另行约分。';
  }
  let needsComputation=true;
  function schedule(recompute=false) {
    needsComputation=needsComputation||recompute;
    if(renderFrame)return;
    renderFrame=requestAnimationFrame(()=>{
      renderFrame=0;
      try {
        if(needsComputation){
          const duration=Number($('duration').value),options={duration,samples:2401};
          computed={analysis:M.analyze(gains),current:M.step(gains,options),plant:M.plantStep(options),comparison:pinned?M.step(pinned,options):null,locus:M.rootLocus(gains,{maxGain:Number($('locus-max').value),samples:700}),duration};
          needsComputation=false;updateLabels();
        }
        drawStep();drawPoles();drawLocus();
        document.body.dataset.ready='true';
      }catch(error){$('input-error').textContent=`计算未完成：${error.message}`;console.error(error);}
    });
  }
  new ResizeObserver(()=>schedule()).observe(document.querySelector('.results'));
  if(!selectedPreset)$('preset-note').textContent='已恢复上次的 PID 参数。可选择预设重新开始比较。';
  syncControls();previewTarget();schedule(true);
})();
