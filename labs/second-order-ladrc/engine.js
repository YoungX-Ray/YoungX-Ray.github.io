/* Continuous second-order LADRC. Independent browser/Node numerical core.
 * Plant: y'' + 1.2 y' + 4 y = b u + d. ESO receives applied (limited) u.
 * Comparison PID: same gains as the prior lesson, derivative of error with
 * Tf = 0.02 s. This is explicitly not the prior ideal derivative model.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LADRC=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const defaults=Object.freeze({wc:3,ratio:5,b0:4,b:4,disturbance:1,disturbanceTime:6,noise:0,limit:0,duration:12});
 const pid=Object.freeze({kp:9.65,ki:18,kd:2.75,tf:.02});
 function config(options={}){
  const c={...defaults,...options};
  const bounds={wc:[.5,6],ratio:[1,12],b0:[.5,8],b:[1,8],disturbance:[-3,3],disturbanceTime:[2,9],noise:[0,.05],limit:[0,20],duration:[12,20]};
  for(const [key,[lo,hi]] of Object.entries(bounds))if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw Error('参数超出范围：'+key);
  return c;
 }
 function design(c){const wo=c.wc*c.ratio;return {wc:c.wc,wo,kp:c.wc*c.wc,kd:2*c.wc,beta1:3*wo,beta2:3*wo*wo,beta3:wo**3};}
 function noise(t,amplitude){return amplitude*(Math.sin(2*Math.PI*12*t)+.5*Math.sin(2*Math.PI*19*t))/1.5;}
 const clip=(u,limit)=>limit>0?Math.max(-limit,Math.min(limit,u)):u;
 function signals(t,x,c,g,d){
  const n=noise(t,c.noise),ym=x[0]+n,raw=(g.kp*(1-x[2])-g.kd*x[3]-x[4])/c.b0,u=clip(raw,c.limit);
  const ep=1-x[5]-n,upRaw=pid.kp*ep+pid.ki*x[7]+pid.kd*(ep-x[8])/pid.tf,up=clip(upRaw,c.limit);
  const f=-1.2*x[1]-4*x[0]+(c.b-c.b0)*u+d;
  return {n,ym,raw,u,ep,upRaw,up,f,d};
 }
 function derivative(t,x,c,g,d){
  const q=signals(t,x,c,g,d),ey=q.ym-x[2];
  // Conditional integration: stop winding up only when the error pushes
  // further into saturation. The comparison always uses the same limit.
  const stopI=c.limit>0&&((q.upRaw>c.limit&&q.ep>0)||(q.upRaw<-c.limit&&q.ep<0));
  return [x[1],-1.2*x[1]-4*x[0]+c.b*q.u+d,
   x[3]+g.beta1*ey,x[4]+c.b0*q.u+g.beta2*ey,g.beta3*ey,
   x[6],-1.2*x[6]-4*x[5]+c.b*q.up+d,stopI?0:q.ep,(q.ep-x[8])/pid.tf];
 }
 function rk4(t,x,h,c,g,d){
  const a=derivative(t,x,c,g,d),b=derivative(t+h/2,x.map((v,i)=>v+h*a[i]/2),c,g,d),e=derivative(t+h/2,x.map((v,i)=>v+h*b[i]/2),c,g,d),f=derivative(t+h,x.map((v,i)=>v+h*e[i]),c,g,d);
  return x.map((v,i)=>v+h*(a[i]+2*b[i]+2*e[i]+f[i])/6);
 }
 function matrix(c,g=design(c)){
  const q=c.b/c.b0;
  return [[0,1,0,0,0],[-4,-1.2,-q*g.kp,-q*g.kd,-q],[g.beta1,0,-g.beta1,1,0],[g.beta2,0,-g.beta2-g.kp,-g.kd,0],[g.beta3,0,-g.beta3,0,0]];
 }
 function characteristic(A){
  const n=A.length;let B=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j))),p=[1];
  for(let k=1;k<=n;k++){
   const M=A.map(row=>row.map((_,j)=>row.reduce((sum,a,l)=>sum+a*B[l][j],0)));
   const coefficient=-M.reduce((sum,row,i)=>sum+row[i],0)/k;p.push(coefficient);
   B=M.map((row,i)=>row.map((v,j)=>v+(i===j?coefficient:0)));
  }
  return p;
 }
 const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im}),sub=(a,b)=>({re:a.re-b.re,im:a.im-b.im}),mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re}),div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};},abs=z=>Math.hypot(z.re,z.im);
 function evaluate(p,z){let value={re:p[0],im:0},deriv={re:0,im:0};for(let i=1;i<p.length;i++){deriv=add(mul(deriv,z),value);value=add(mul(value,z),{re:p[i],im:0});}return {value,deriv};}
 function roots(coefficients){
  const n=coefficients.length-1,scale=Math.max(1,...coefficients.slice(1).map((v,i)=>Math.abs(v/coefficients[0])**(1/(i+1))));
  const p=coefficients.map((v,i)=>v/coefficients[0]/scale**i);
  let z=Array.from({length:n},(_,i)=>({re:.9*Math.cos(2*Math.PI*(i+.23)/n),im:.9*Math.sin(2*Math.PI*(i+.23)/n)}));
  for(let it=0;it<400;it++){
   let change=0;
   z=z.map((v,i)=>{
    const e=evaluate(p,v);if(abs(e.value)<1e-16)return v;
    let newton=div(e.value,e.deriv),sum={re:0,im:0};
    for(let j=0;j<n;j++)if(j!==i)sum=add(sum,div({re:1,im:0},sub(v,z[j])));
    const step=div(newton,sub({re:1,im:0},mul(newton,sum)));
    change=Math.max(change,abs(step));return sub(v,step);
   });
   if(change<1e-13)break;
  }
  const residual=Math.max(...z.map(v=>abs(evaluate(p,v).value)));
  if(!Number.isFinite(residual)||residual>1e-8)throw Error('特征根数值计算未收敛');
  return z.map(v=>({re:v.re*scale,im:Math.abs(v.im*scale)<1e-7?0:v.im*scale})).sort((a,b)=>a.re-b.re||a.im-b.im);
 }
 function metrics(rows,key,c){
  const before=rows.filter(row=>row.t<c.disturbanceTime-1e-8),after=rows.filter(row=>row.t>=c.disturbanceTime-1e-8);
  const lastOut=before.reduce((index,row,i)=>Math.abs(row[key]-1)>.02?i:index,-1);
  const settle=lastOut<0?0:lastOut<before.length-1?before[lastOut+1].t:null;
  const iae=rows.slice(1).reduce((s,r,i)=>s+(r.t-rows[i].t)*(Math.abs(1-r[key])+Math.abs(1-rows[i][key]))/2,0);
  const ukey=key==='y'?'u':'uPid',tail=rows.filter(row=>row.t>=c.duration-2),mean=tail.reduce((s,r)=>s+r[ukey],0)/tail.length;
  return {iae,peakDeviationAfter:Math.max(...after.map(row=>Math.abs(row[key]-1))),preDisturbanceOvershoot:Math.max(0,...before.map(row=>(row[key]-1)*100)),preDisturbanceSettling:settle,endError:1-rows.at(-1)[key],peakControl:Math.max(...rows.map(row=>Math.abs(row[ukey]))),tailControlStd:Math.sqrt(tail.reduce((s,r)=>s+(r[ukey]-mean)**2,0)/tail.length)};
 }
 function simulate(options={},numerics={}){
  const c=config(options),g=design(c),dt=numerics.dt??Math.min(.001,.04/Math.max(g.wo,c.noise>0?2*Math.PI*19:0)),sample=numerics.sample??.01;
  if(!Number.isFinite(dt)||dt<=0||dt>.005||!Number.isFinite(sample)||sample<dt)throw Error('无效的积分或记录步长');
  let x=Array(9).fill(0),t=0,nextSample=0,stopped=false;const rows=[];
  const record=()=>{const d=t>=c.disturbanceTime-1e-9?c.disturbance:0,q=signals(t,x,c,g,d);rows.push({t,y:x[0],v:x[1],z1:x[2],z2:x[3],z3:x[4],yPid:x[5],vPid:x[6],integralPid:x[7],filterPid:x[8],...q,uPid:q.up});};
  record();nextSample=sample;
  while(t<c.duration-1e-10){
   // Split exactly at the disturbance edge and sample grid. Each integration
   // interval sees a constant external d, including its right-end RK stage.
   let h=Math.min(dt,c.duration-t,nextSample-t);
   if(t<c.disturbanceTime-1e-9)h=Math.min(h,c.disturbanceTime-t);
   const d=t>=c.disturbanceTime-1e-9?c.disturbance:0;
   x=rk4(t,x,h,c,g,d);t+=h;
   if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)){stopped=true;break;}
   if(t>=nextSample-1e-9||t>=c.duration-1e-9){record();nextSample+=sample;}
  }
  const A=matrix(c,g),polynomial=characteristic(A),poles=roots(polynomial),stable=poles.every(p=>p.re<-1e-7);
  return {config:c,gains:g,pid,rows,A,polynomial,poles,stable,stopped,dt,sample,metrics:stopped?null:{ladrc:metrics(rows,'y',c),pid:metrics(rows,'yPid',c)}};
 }
 return {defaults,pid,config,design,noise,signals,derivative,rk4,matrix,characteristic,roots,simulate};
});
