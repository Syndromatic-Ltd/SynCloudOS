// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NSEViewController, nseAttachView, nseUpdateViewActivity } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { attachNSEAuthoringContext } from '../../src/NSE/Application/authoringContext';
import { managedTask } from '../../src/NSE/Tasks/managedTask';

describe('task activity epochs',()=>{
  it('cancels an old visible epoch and requires explicit admission after resume',async()=>{
    const view=new NSEViewController({owner:nseUnowned});const started=vi.fn(()=>new Promise<string>(()=>{}));
    const detach=view[nseAttachView]({element:document.createElement('div')});
    const task=managedTask(view,{lifetime:'visible',policy:'latest',run:started});
    const first=task.run(undefined);expect(started).toHaveBeenCalledTimes(1);
    view[nseUpdateViewActivity](false);
    expect(await first.finished).toEqual({status:'cancelled',reason:'lifetime-ended'});
    view[nseUpdateViewActivity](true);expect(started).toHaveBeenCalledTimes(1);
    const second=task.run(undefined);expect(started).toHaveBeenCalledTimes(2);
    detach();await Promise.resolve();expect(await second.finished).toMatchObject({status:'cancelled'});view.dispose();
  });
  it('uses the injected scheduler, removes old timers and retains only latest arguments',async()=>{
    const view=new NSEViewController({owner:nseUnowned});const callbacks=new Set<()=>void>();
    const errors=vi.fn();attachNSEAuthoringContext(view,{
      scheduler:{setTimeout(callback){callbacks.add(callback);return{dispose(){callbacks.delete(callback);}};}},
      errors:{capture:errors},persistence:{getPreference:(_,fallback)=>fallback,setPreference:()=>true},subscribePreferences:()=>()=>{},
    });
    const run=vi.fn((value:number)=>value*2);const task=managedTask(view,{lifetime:'owner',policy:'latest',debounceMs:50,run});
    const old=task.run(1),current=task.run(2);expect(callbacks.size).toBe(1);expect(run).not.toHaveBeenCalled();
    for(const callback of [...callbacks]) callback();
    expect(await old.finished).toMatchObject({status:'cancelled',reason:'superseded'});
    expect(await current.finished).toEqual({status:'succeeded',value:4});expect(run).toHaveBeenCalledTimes(1);expect(errors).not.toHaveBeenCalled();view.dispose();
  });
  it('does not use an async commit or apply callback as a publication boundary',async()=>{
    const view=new NSEViewController({owner:nseUnowned});let writes=0;
    const task=managedTask(view,{lifetime:'owner',policy:'latest',run:(_,context)=>context.commit(async()=>{writes++;})});
    expect(await task.run(undefined).finished).toMatchObject({status:'failed'});expect(writes).toBe(0);view.dispose();
  });
});
