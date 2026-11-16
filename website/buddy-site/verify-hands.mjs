import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const pixels=()=>page.locator('#ascii-hands').evaluate(c=>{const s=c.toDataURL();let h=2166136261;for(let i=0;i<s.length;i+=97)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;});
  await page.goto('http://127.0.0.1:1430');await page.waitForFunction(()=>document.querySelector('#ascii-hands').dataset.artwork==='anatomical');
  const first=await pixels();await page.waitForTimeout(700);assert.notEqual(await pixels(),first,'Artwork must animate');
  await page.locator('#motion-toggle').click();await page.waitForTimeout(100);const paused=await pixels();await page.waitForTimeout(500);assert.equal(await pixels(),paused,'Artwork must honor pause');
  await page.locator('#motion-toggle').click();
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await page.waitForTimeout(150);const returned=await pixels();await page.waitForTimeout(700);assert.notEqual(await pixels(),returned,'Artwork must resume after back/forward cache restoration');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='paused');await page.waitForTimeout(100);const reduced=await pixels();await page.waitForTimeout(500);assert.equal(await pixels(),reduced,'Artwork must honor OS reduced motion');
  console.log('PASS: anatomical artwork loaded, animation, pause, back/forward restoration, reduced motion');
}finally{await browser.close();}
