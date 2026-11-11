import { describe, expect, it, vi } from 'vitest';
import { NSEViewController } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { managedTask } from '../../src/NSE/Tasks/managedTask';
import { attachNSEAuthoringContext } from '../../src/NSE/Application/authoringContext';

const owner = () => new NSEViewController({owner:nseUnowned});
describe('managed task',()=>{
  it('supersedes promptly and refuses late publication even when abort is ignored',async()=>{
    const view=owner(); const resolve:Array<(value:string)=>void>=[];const applied:string[]=[];
    const task=managedTask(view,{lifetime:'owner',policy:'latest',run:()=>new Promise<string>(done=>resolve.push(done)),apply:value=>{applied.push(value);}});
    const first=task.run(undefined),second=task.run(undefined);
    expect(await first.finished).toEqual({status:'cancelled',reason:'superseded'});
    resolve[1]('new');expect(await second.finished).toEqual({status:'succeeded',value:'new'});
    resolve[0]('old');await Promise.resolve();expect(applied).toEqual(['new']);view.dispose();
  });
  it('revokes commit and owned construction immediately on close',async()=>{
    const view=owner();let commit!:()=>boolean;let acquire!:()=>unknown;let calls=0;
    const task=managedTask(view,{lifetime:'owner',policy:'latest',run:(_,context)=>{
      commit=()=>context.commit(()=>{calls++;});acquire=()=>context.own(()=>{calls++;return{dispose(){}};});return new Promise(()=>{});
    }});
    const run=task.run(undefined);view.dispose();
    expect(await run.finished).toEqual({status:'cancelled',reason:'owner-disposed'});
    expect(commit()).toBe(false);expect(acquire).toThrow();expect(calls).toBe(0);
  });
  it('runs serial writes in FIFO order and fails queue overflow without executing',async()=>{
    const view=owner();const started:number[]=[];const finish:Array<()=>void>=[];
    const task=managedTask(view,{lifetime:'owner',policy:'serial',maximumQueued:1,run:(n:number)=>{started.push(n);return new Promise<void>(done=>finish.push(done));}});
    const first=task.run(1),second=task.run(2),third=task.run(3);
    expect(await third.finished).toMatchObject({status:'failed',error:{name:'NSETaskQueueFullError'}});
    expect(started).toEqual([1]);finish[0]();await first.finished;expect(started).toEqual([1,2]);finish[1]();await second.finished;view.dispose();
  });
  it('keeps last success while pending and consumes failed promises',async()=>{
    const view=owner();const task=managedTask(view,{lifetime:'owner',policy:'latest',run:async(n:number)=>{if(n<0)throw Error('failed');return n;}});
    await task.run(7).finished;const run=task.run(-1);
    expect(task.getSnapshot()).toMatchObject({pending:true,value:7});
    expect(await run.finished).toMatchObject({status:'failed'});expect(task.getSnapshot()).toMatchObject({pending:false,value:7,error:expect.any(Error)});view.dispose();
  });
  it('releases run resources on success, failure and cancellation',async()=>{
    const view=owner();const released=vi.fn();const task=managedTask(view,{lifetime:'owner',policy:'latest',run:(_,context)=>{context.own(()=>({dispose:released}));return 1;}});
    await task.run(undefined).finished;expect(released).toHaveBeenCalledTimes(1);view.dispose();expect(released).toHaveBeenCalledTimes(1);
  });
  it('does not admit inactive mounted work',async()=>{
    const view=owner();const run=vi.fn();const task=managedTask(view,{lifetime:'mounted',policy:'latest',run});
    expect(await task.run(undefined).finished).toEqual({status:'cancelled',reason:'lifetime-ended'});expect(run).not.toHaveBeenCalled();view.dispose();
  });
  it('does not start queued writes when cancelling the entire task',async()=>{
    const view=owner();const started:number[]=[];
    const task=managedTask(view,{lifetime:'owner',policy:'serial',run:(n:number)=>{started.push(n);return new Promise(()=>{});}});
    const first=task.run(1),second=task.run(2);task.cancel();
    await first.finished;await second.finished;expect(started).toEqual([1]);view.dispose();
  });
  it('releases a plain resource if reentrancy disposes its run during construction',async()=>{
    const view=owner();const released=vi.fn();
    const task=managedTask(view,{lifetime:'owner',policy:'latest',run:(_,context)=>context.own(()=>{view.dispose();return{dispose:released};})});
    expect(await task.run(undefined).finished).toMatchObject({status:'cancelled'});expect(released).toHaveBeenCalledTimes(1);
  });
  it('preserves operation and cleanup failures in one diagnostic and still settles',async()=>{
    const view=owner();const capture=vi.fn();attachNSEAuthoringContext(view,{
      scheduler:{setTimeout:()=>({dispose(){}})},errors:{capture},persistence:{getPreference:(_,fallback)=>fallback,setPreference:()=>true},subscribePreferences:()=>()=>{},
    });
    const operation=Error('operation'),cleanup=Error('cleanup');
    const task=managedTask(view,{lifetime:'owner',policy:'latest',run:(_,context)=>{context.own(()=>({dispose(){throw cleanup;}}));throw operation;}});
    const settled=await task.run(undefined).finished;
    expect(settled).toMatchObject({status:'failed',error:expect.any(AggregateError)});
    if(settled.status==='failed')expect((settled.error as AggregateError).errors).toEqual([operation,cleanup]);
    expect(capture).toHaveBeenCalledTimes(1);view.dispose();
  });
});
