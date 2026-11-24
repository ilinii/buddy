import {test,expect,type Page} from '@playwright/test';
import {nativeTransport} from './support/native-transport';
async function record(page:Page){
 await page.getByRole('button',{name:'Record meeting',exact:true}).click();await page.getByRole('textbox',{name:'Meeting title'}).fill('Report regression');await page.getByRole('checkbox',{name:'I have informed participants and have permission to record.',exact:true}).check();await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.getByRole('region',{name:'Microphone recording studio'}).waitFor();
 await page.evaluate(()=>window.engineMock.push('We agreed to review the proposal on Friday.',12));
}
async function cloud(page:Page){await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('nvidia');await page.getByRole('checkbox',{name:'Allow selected text to NVIDIA',exact:true}).check();await page.getByRole('button',{name:'Close dialog',exact:true}).click();}
for(const width of [1180,390])test(`finish automatically saves late speech and excerpts without cloud permission at ${width}`,async({page})=>{
 await nativeTransport(page);await page.setViewportSize({width,height:850});await page.goto('/?demo=home');await record(page);
 const note=page.getByRole('textbox',{name:'Meeting notes editor',exact:true});await note.fill('Keep my typed thoughts.');await page.getByRole('button',{name:'Finish',exact:true}).click();
 await expect(page.getByRole('region',{name:'Meeting report status'})).toContainText('Transcript excerpts saved');
 await expect(page.getByRole('textbox',{name:'Transcript excerpts editor'})).toContainText('Final passage captured during stop.');await expect(note).toContainText('Keep my typed thoughts.');
 expect(await page.evaluate(()=>window.engineMock.calls.includes('notes_generate_nvidia'))).toBe(false);await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'Open Report regression',exact:true}).click();await expect(page.getByRole('textbox',{name:'Transcript excerpts editor'})).toContainText('Final passage');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('cloud finish report includes stop-time speech, reports quota errors and retries without losing edits',async({page})=>{
 await nativeTransport(page);await page.goto('/?demo=home');await cloud(page);await record(page);await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('My own note.');await page.evaluate(()=>{window.engineMock.reportError=true;});await page.getByRole('button',{name:'Finish',exact:true}).click();await expect(page.locator('.meeting-report')).toContainText('quota unavailable');await expect(page.locator('.transcript-segment')).toHaveCount(0);
 expect(await page.evaluate(()=>window.engineMock.reportSources?.length)).toBe(2);await page.evaluate(()=>{window.engineMock.reportError=false;window.engineMock.reportDelay=500;});await page.getByRole('button',{name:'Retry report',exact:true}).click();await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('Edited during report generation.');await expect(page.getByRole('textbox',{name:'Meeting report · AI draft editor'})).toContainText('proposal');await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Edited during report generation.');expect(await page.evaluate(()=>window.engineMock.calls.filter(c=>c==='notes_generate_nvidia').length)).toBe(2);
 await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.transcript-segment')).toHaveCount(2);await expect(page.locator('.transcript-segment').last()).toContainText('during stop');
});
test('speaker display uses anonymous labels without adding reconnect counts',async({page})=>{
 await nativeTransport(page);await page.goto('/?demo=home');await record(page);await page.evaluate(()=>{const s=window.engineMock.session!;s.segments[0].speaker='microphone · voice 1 · connection 1';s.segments.push({...s.segments[0],id:'second-voice',speaker:'microphone · voice 2 · connection 1'},{...s.segments[0],id:'reconnected-voice',speaker:'microphone · voice 1 · connection 2'});});await page.getByRole('button',{name:'Finish',exact:true}).click();await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.speaker-detection')).toContainText('2 voices detected');await page.locator('.speaker-detection summary').click();await expect(page.locator('.speaker-detection')).toContainText('maximum in one connection');
});
test('orphaned native journals recover into a visible recording instead of being discarded',async({page})=>{
 await nativeTransport(page);await page.goto('/?demo=home');await page.evaluate(()=>{sessionStorage.setItem('engine-journal',JSON.stringify({sessionId:crypto.randomUUID(),meetingId:crypto.randomUUID(),startedAt:1700000000,status:'complete',duration:8,segments:[{id:'orphan-final',start:1,end:7,text:'Speech survived a missing workspace entry.',channel:'microphone',final:true}],transcribing:true,retainedAudio:false,warnings:[]}));});await page.reload();await page.getByRole('button',{name:'Open Recovered recording',exact:true}).click();await expect(page.locator('.meeting-report')).toContainText('Recovered saved speech');await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.transcript-segment')).toContainText('Speech survived');
});

test('a report that repeats a citation and subsequent note edits both survive reload', async ({page}) => {
  await nativeTransport(page);
  await page.goto('/?demo=home');
  await cloud(page);
  await record(page);
  await page.evaluate(() => { window.engineMock.repeatReportEvidence = true; });
  await page.getByRole('button', {name: 'Finish', exact: true}).click();
  await expect(page.locator('.meeting-report')).toContainText('Report ready');
  const note = page.getByRole('textbox', {name: 'Meeting notes editor', exact: true});
  await note.fill('Edited after receiving the report.');
  await expect(page.getByText('Saved locally', {exact: true})).toBeVisible();
  await page.reload();
  await page.getByRole('button', {name: 'Open Report regression', exact: true}).click();
  await expect(note).toContainText('Edited after receiving the report.');
  await expect(page.locator('.meeting-report')).toContainText('Report ready');
  await expect(page.getByRole('checkbox', {name: 'Complete Review proposal'})).toBeVisible();
});
