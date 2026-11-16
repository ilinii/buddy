import {afterEach,expect,it,vi} from 'vitest';
import {extractDocument} from '../../src/documents/service';
afterEach(()=>vi.unstubAllGlobals());
it('ignores PDF helper packets and waits for the tagged extraction result',async()=>{
 let terminations=0;
 class WorkerMock {
  onmessage?: (event:MessageEvent)=>void;
  terminate(){terminations++;}
  postMessage(){queueMicrotask(()=>{this.onmessage?.({data:{sourceName:'worker',targetName:'main',action:'ready'}} as MessageEvent);queueMicrotask(()=>this.onmessage?.({data:{type:'document-result',document:{id:'test',chunks:[{text:'Public fixture'}]}}} as MessageEvent));});}
 }
 vi.stubGlobal('Worker',WorkerMock);
 const result=await extractDocument(new File(['fixture'],'test.pdf'),'Tests');
 expect(result.id).toBe('test');expect(terminations).toBe(1);
});
it('reports a tagged extraction failure and terminates its worker',async()=>{
 let terminated=false;
 class WorkerMock {
  onmessage?: (event:MessageEvent)=>void;
  terminate(){terminated=true;}
  postMessage(){queueMicrotask(()=>this.onmessage?.({data:{type:'document-result',error:'No readable text'}} as MessageEvent));}
 }
 vi.stubGlobal('Worker',WorkerMock);
 await expect(extractDocument(new File(['fixture'],'test.pdf'),'Tests')).rejects.toThrow('No readable text');expect(terminated).toBe(true);
});
