// Original Buddy ambient glyph field; Canvas 2D, no copied registry shader.
import {useEffect,useRef,type ComponentProps} from 'react';
import {useShouldReduceMotion} from '../motion-system';
export function GlyphBackground({className='',shapeColor='#666666',fontSize=12,glowColor:_,interactive:__,...props}:ComponentProps<'div'>&{shapeColor?:string;glowColor?:string;fontSize?:number;interactive?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),phase=useRef(0),reduced=useShouldReduceMotion();
 useEffect(()=>{
  const element=canvas.current;if(!element)return;const ctx=element.getContext('2d');if(!ctx)return;
  let frame=0,last=0,width=0,height=0,visible=true,disposed=false;
  const glyphs='01abcef{}[]';
  function draw(){
   ctx!.clearRect(0,0,width,height);ctx!.font=`${fontSize}px ui-monospace,Consolas,monospace`;ctx!.fillStyle=shapeColor;ctx!.textBaseline='middle';
   const spacing=54;
   for(let row=-1;row<height/spacing+1;row++)for(let col=0;col<width/spacing+1;col++){
    const seed=((col*127+row*61)%97+97)%97,x=col*spacing+Math.sin(seed)*18;
    const y=((row*spacing+seed*.37+phase.current*(5+seed%7))%(height+spacing)+height+spacing)%(height+spacing)-spacing;
    ctx!.globalAlpha=.07+(Math.sin(seed+phase.current*.6)+1)*.065;ctx!.fillText(glyphs[seed%glyphs.length],x,y);
   }
   ctx!.globalAlpha=1;
  }
  function tick(now:number){if(disposed||reduced||!visible||document.hidden)return;if(now-last>1000/24){phase.current+=Math.min((now-last)/1000,.06);last=now;draw();}frame=requestAnimationFrame(tick);}
  function run(){cancelAnimationFrame(frame);last=performance.now();if(!disposed&&!reduced&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
  function resize(){const box=element!.getBoundingClientRect();width=box.width;height=box.height;const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1500000/Math.max(width*height,1)));element!.width=Math.round(width*ratio);element!.height=Math.round(height*ratio);ctx!.setTransform(ratio,0,0,ratio,0,0);draw();run();}
  const observer=new ResizeObserver(resize);observer.observe(element);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;run();});intersection.observe(element);
  document.addEventListener('visibilitychange',run);resize();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',run);};
 },[reduced,fontSize,shapeColor]);
 return <div className={`buddy-glyph-field ${className}`} aria-hidden="true" {...props}><canvas ref={canvas} data-static={reduced} style={{width:'100%',height:'100%',display:'block'}}/></div>;
}
