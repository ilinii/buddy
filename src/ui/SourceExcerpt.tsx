import type { ReactNode } from 'react';
/** Source text stays inert: no HTML, scripts, external images or links are executed. */
export function SourceExcerpt({text,name}:{text:string;name:string}) {
  const markdown=/\.(md|markdown)$/i.test(name);
  const blocks:ReactNode[]=text.split(/\n\s*\n/).map((block,index)=>{
    const heading=markdown&&/^(#{1,3})\s+([^\n]+)$/.exec(block.trim());
    if(heading)return heading[1].length===1?<h4 key={index}>{heading[2]}</h4>:<h5 key={index}>{heading[2]}</h5>;
    const lines=block.split('\n');
    if(markdown&&lines.every(line=>/^[-*]\s+/.test(line)))return <ul key={index}>{lines.map((line,i)=><li key={i}>{line.replace(/^[-*]\s+/,'')}</li>)}</ul>;
    return <p key={index}>{block}</p>;
  });
  return <article className="document-excerpt" aria-label="Source excerpt">{blocks}</article>;
}
