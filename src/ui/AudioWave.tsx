import {useEffect,useRef} from 'react';
import {useShouldReduceMotion} from './motion-system';

/** Preview is labelled sample audio. Real capture amplitude comes only from RMS. */
export function AudioWave({level=0,preview=false,paused=false,quiet=false,className=''}:{level?:number;preview?:boolean;paused?:boolean;quiet?:boolean;className?:string}){
 const ref=useRef<HTMLCanvasElement>(null),rms=useRef(level);rms.current=level;
 const reduced=useShouldReduceMotion();
 useEffect(()=>{
  const node=ref.current,ctx=node?.getContext('2d');if(!node||!ctx)return;
  let frame=0,last=0,time=0,width=0,height=0,visible=true,disposed=false;
  const still=paused||quiet||reduced;
  function draw(){
   ctx!.clearRect(0,0,width,height);const power=paused?0:preview?.65:Math.min(1,Math.max(0,rms.current)*5);
   const bars=Math.min(72,Math.max(18,Math.floor(width/6))),gap=width/bars;
   ctx!.fillStyle=getComputedStyle(node!).color;
   for(let i=0;i<bars;i++){
    const envelope=.45+.55*Math.sin((i+.5)/bars*Math.PI);
    const signal=.18+.82*Math.abs(Math.sin(i*.57-time*3.7)*Math.cos(i*.21+time*2.3));
    const h=2+power*signal*envelope*(height-4);ctx!.globalAlpha=.32+signal*.52;
    ctx!.beginPath();ctx!.roundRect(i*gap+gap*.22,(height-h)/2,Math.max(1.5,gap*.34),h,2);ctx!.fill();
   }ctx!.globalAlpha=1;
  }
  function tick(now:number){frame=0;if(disposed||still||document.hidden||!visible)return;if(now-last>=33){time+=Math.min(now-last||33,80)/1000;last=now;draw();}frame=requestAnimationFrame(tick);}
  function sync(){if(disposed)return;cancelAnimationFrame(frame);last=0;draw();if(!still&&!document.hidden&&visible)frame=requestAnimationFrame(tick);}
  const resize=new ResizeObserver(()=>{const rect=node.getBoundingClientRect();width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio||1,1.5);node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);sync();});resize.observe(node);
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;sync();});observer.observe(node);
  document.addEventListener('visibilitychange',sync);
  return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',sync);};
 },[preview,paused,quiet,reduced]);
 return <canvas ref={ref} className={`audio-wave ${className}`} aria-hidden="true" data-static={paused||quiet||reduced} data-preview={preview}/>;
}
