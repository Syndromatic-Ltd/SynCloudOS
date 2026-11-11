// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NSEViewController,nseAttachView } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { outlet,type NSEViewOutlet } from '../../src/NSE/Application/viewOutlet';

class View extends NSEViewController {
  @outlet accessor art!:NSEViewOutlet<HTMLDivElement>;
}
describe('managed outlets',()=>{
  it('keeps a stable handle and diagnoses unmounted access',()=>{
    const view=new View({owner:nseUnowned});const handle=view.art;
    expect(view.art).toBe(handle);expect(handle.current).toBeNull();expect(()=>handle.element).toThrow();view.dispose();
  });
  it('connects committed refs before viewDidLoad and releases a conditional mount',async()=>{
    const view=new View({owner:nseUnowned});const node=document.createElement('div');view.art.ref(node);
    const detach=view[nseAttachView]({element:document.createElement('div')});
    expect(view.art.element).toBe(node);const signal=view.art.mountSignal;
    view.art.ref(null);expect(signal.aborted).toBe(false);await Promise.resolve();
    expect(signal.aborted).toBe(true);expect(view.art.current).toBeNull();detach();view.dispose();
  });
  it('normalizes callback ref replay but rejects two simultaneous live nodes',async()=>{
    const view=new View({owner:nseUnowned});const first=document.createElement('div');view.art.ref(first);
    view[nseAttachView]({element:document.createElement('div')});const signal=view.art.mountSignal;
    view.art.ref(null);view.art.ref(first);await Promise.resolve();expect(view.art.mountSignal).toBe(signal);expect(signal.aborted).toBe(false);
    expect(()=>view.art.ref(document.createElement('div'))).toThrow(/live/i);view.dispose();expect(signal.aborted).toBe(true);
  });
  it('does not let an old ref cleanup remove a replacement node',async()=>{
    const view=new View({owner:nseUnowned});const first=document.createElement('div'),next=document.createElement('div');
    const oldCleanup=view.art.ref(first) as unknown as (()=>void);
    view[nseAttachView]({element:document.createElement('div')});oldCleanup();view.art.ref(next);oldCleanup();await Promise.resolve();
    expect(view.art.current).toBe(next);view.dispose();
  });
});
