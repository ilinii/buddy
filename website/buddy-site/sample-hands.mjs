// Compile the generated image into an alpha/luminance field for the ASCII renderer.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const png=await readFile(new URL('assets/creation-hands-master.png',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  const result=await page.evaluate(async image=>{
    const source=new Image();source.src=image;await source.decode();
    const width=768,height=Math.round(width*source.height/source.width),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,width,height);const rgba=ctx.getImageData(0,0,width,height).data,field=[];
    let occupied=0;
    for(let i=0;i<rgba.length;i+=4){const alpha=rgba[i+3];field.push(alpha,Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]));if(alpha>25)occupied++;}
    return {width,height,field,occupied,cornerAlpha:rgba[3]};
  },`data:image/png;base64,${png.toString('base64')}`);
  if(result.cornerAlpha!==0)throw Error('Hand artwork must have a transparent background');
  const header=Buffer.alloc(8);header.writeUInt32LE(result.width,0);header.writeUInt32LE(result.height,4);
  await writeFile(new URL('dist/site/creation-hands.bin',import.meta.url),Buffer.concat([header,Buffer.from(result.field)]));
  console.log(JSON.stringify({width:result.width,height:result.height,occupied:result.occupied,transparent:true}));
}finally{await browser.close();}
