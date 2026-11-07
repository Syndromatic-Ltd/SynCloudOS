// @vitest-environment jsdom
import { describe,expect,it,vi } from 'vitest';
import { NSEViewController,nseAttachView,nseUpdateTraits,nseUpdateViewActivity } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { outlet,type NSEViewOutlet } from '../../src/NSE/Application/viewOutlet';
import { AFXRenderer } from '../../src/FX/AnimationFX/AFXRenderer';
import type { AFXFrameScheduler } from '../../src/FX/AnimationFX/AFXLayer';

class CanvasView extends NSEViewController { @outlet accessor canvas!:NSEViewOutlet<HTMLCanvasElement>; }
function fixture(width=200,height=100) {
  const view=new CanvasView({owner:nseUnowned});const canvas=document.createElement('canvas');
  Object.defineProperties(canvas,{clientWidth:{configurable:true,value:width},clientHeight:{configurable:true,value:height}});
  const pending=new Set<(time:number)=>void>();let time=0;const rendered=vi.fn();const dispose=vi.fn();
  const frames:AFXFrameScheduler={now:()=>time,reducedMotion:false,suspended:false,requestFrame(callback){pending.add(callback);return()=>{pending.delete(callback);};}};
  const createRenderer=vi.fn((_target:object,_options:unknown,signal?:AbortSignal)=>new AFXRenderer({width:200,height:100,scheduler:frames,signal,target:{render:rendered,dispose}}));
  view.canvas.ref(canvas);
  const detach=view[nseAttachView]({element:document.createElement('div'),fx:{animation:{client:{createRenderer},frames}} as any});
  return{view,canvas,pending,dispose,createRenderer,detach,tick(next:number){time=next;for(const callback of [...pending]){pending.delete(callback);callback(time);}}};
}
describe('managed canvas renderer',()=>{
  it('uses the scoped client, full DPR and one cached mount-specific manager',()=>{
    Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:2});
    const f=fixture();const managed=f.view.fx.animation.manageRenderer(f.view.canvas,{maximumQuads:4096});
    expect(f.view.fx.animation.manageRenderer(f.view.canvas,{maximumQuads:4096})).toBe(managed);
    expect(managed.getSnapshot()).toMatchObject({width:200,height:100,pixelRatio:2,active:true});
    expect(f.createRenderer).toHaveBeenCalledTimes(1);expect(managed.renderer).toBeInstanceOf(AFXRenderer);f.view.dispose();expect(f.dispose).toHaveBeenCalledTimes(1);
  });
  it('pauses callbacks while inactive and resumes with delta zero',()=>{
    const f=fixture();const managed=f.view.fx.animation.manageRenderer(f.view.canvas,{});const frames:Array<{time:number;delta:number}>=[];
    managed.onFrame(frame=>{frames.push(frame);},{reducedMotion:'continue'});f.tick(1);f.tick(2);
    expect(frames.map(frame=>frame.delta)).toEqual([0,1]);f.view[nseUpdateViewActivity](false);f.tick(80);expect(frames).toHaveLength(2);
    f.view[nseUpdateViewActivity](true);f.tick(90);expect(frames.at(-1)).toMatchObject({time:90,delta:0});f.view.dispose();
  });
  it('delivers a static reduced-motion frame and releases callbacks/renderer on real unmount',async()=>{
    const f=fixture();const managed=f.view.fx.animation.manageRenderer(f.view.canvas,{});const frame=vi.fn();
    managed.onFrame(frame,{reducedMotion:'static'});f.tick(1);f.view[nseUpdateTraits]({reducedMotion:true,presentation:null});f.tick(2);const count=frame.mock.calls.length;f.tick(3);expect(frame).toHaveBeenCalledTimes(count);
    f.detach();await Promise.resolve();expect(managed.getSnapshot().active).toBe(false);expect(f.pending.size).toBe(0);expect(f.dispose).toHaveBeenCalledTimes(1);f.view.dispose();
  });
  it('defers zero-size allocation and rejects foreign outlets',()=>{
    const f=fixture(0,0);const managed=f.view.fx.animation.manageRenderer(f.view.canvas,{});
    expect(f.createRenderer).not.toHaveBeenCalled();expect(()=>managed.renderer).toThrow();
    const other=fixture();expect(()=>other.view.fx.animation.manageRenderer(f.view.canvas,{})).toThrow(/belong/i);f.view.dispose();other.view.dispose();
  });
  it('allocates a fresh renderer when the same controller remounts',async()=>{
    const f=fixture();const first=f.view.fx.animation.manageRenderer(f.view.canvas,{});f.detach();await Promise.resolve();
    f.view.canvas.ref(f.canvas);f.view[nseAttachView]({element:document.createElement('div'),fx:{animation:{client:{createRenderer:f.createRenderer},frames:{now:()=>0,reducedMotion:false,suspended:false,requestFrame:()=>()=>{}}}} as any});
    const second=f.view.fx.animation.manageRenderer(f.view.canvas,{});expect(second).not.toBe(first);expect(f.createRenderer).toHaveBeenCalledTimes(2);f.view.dispose();expect(f.dispose).toHaveBeenCalledTimes(2);
  });
});
