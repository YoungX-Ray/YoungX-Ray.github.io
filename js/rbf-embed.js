(() => {
  'use strict';
  if(customElements.get('rbf-training'))return;
  class RBFTraining extends HTMLElement {
    connectedCallback(){
      if(this.cleanup)return;
      const frame=this.querySelector('iframe');if(!frame)return;
      const origin=new URL(frame.src,location.href).origin;
      const theme=()=>frame.contentWindow?.postMessage({type:'rbf-theme',theme:document.documentElement.dataset.theme==='dark'?'dark':'light'},origin);
      const receive=event=>{
        if(event.source!==frame.contentWindow||event.origin!==origin)return;
        if(event.data?.type==='rbf-ready')theme();
        if(event.data?.type==='rbf-height'&&Number.isFinite(event.data.height))frame.style.height=`${Math.max(400,Math.min(12000,Math.ceil(event.data.height)))}px`;
      };
      const observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
      window.addEventListener('message',receive);frame.addEventListener('load',theme);theme();
      this.cleanup=()=>{observer.disconnect();window.removeEventListener('message',receive);frame.removeEventListener('load',theme);this.cleanup=null;};
    }
    disconnectedCallback(){this.cleanup?.();}
  }
  customElements.define('rbf-training',RBFTraining);
})();
