// @vitest-environment jsdom
import { describe,expect,it,vi } from 'vitest';
import { NSEViewController,nseAttachView,nseUpdateTraits } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { outlet,type NSEViewOutlet } from '../../src/NSE/Application/viewOutlet';
import type { AFXFrameScheduler } from '../../src/FX/AnimationFX/AFXLayer';

class SceneView extends NSEViewController { @outlet accessor canvas!:NSEViewOutlet<HTMLCanvasElement>; }
function fixture(width=200,height=100) {
  const view=new SceneView({owner:nseUnowned});const canvas=document.createElement('canvas');
  let size={width,height};
  Object.defineProperties(canvas,{clientWidth:{configurable:true,get:()=>size.width},clientHeight:{configurable:true,get:()=>size.height}});
  const getContext=vi.spyOn(canvas,'getContext');
  const pending=new Set<(time:number)=>void>();let time=0;
  const frames:AFXFrameScheduler={now:()=>time,reducedMotion:false,suspended:false,requestFrame(callback){pending.add(callback);return()=>{pending.delete(callback);};}};
  const createRenderer=vi.fn();
  view.canvas.ref(canvas);
  const detach=view[nseAttachView]({element:document.createElement('div'),fx:{animation:{client:{createRenderer},frames}} as any});
  return{view,canvas,pending,createRenderer,getContext,detach,
    resize(next:{width:number;height:number}){size=next;window.dispatchEvent(new Event('resize'));},
    tick(next:number){time=next;for(const callback of [...pending]){pending.delete(callback);callback(time);}}};
}
describe('managed display link',()=>{
  it('paces frames for a caller-owned context without claiming or resizing the canvas',()=>{
    Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:2});
    const f=fixture();const sizes:unknown[]=[];
    const link=f.view.fx.animation.manageDisplayLink(f.view.canvas,{drawableSizeDidChange:viewport=>sizes.push(viewport)});
    expect(link.canvas).toBe(f.canvas);
    expect(sizes).toEqual([{width:200,height:100,pixelRatio:2}]);
    expect(f.createRenderer).not.toHaveBeenCalled();expect(f.getContext).not.toHaveBeenCalled();
    expect(f.canvas.width).toBe(300);expect(f.canvas.height).toBe(150);
    expect(()=>(link as any).renderer).toThrow(/does not own a renderer/);
    const frames:Array<{delta:number;width:number;pixelRatio:number}>=[];
    link.onFrame(frame=>{frames.push(frame);},{reducedMotion:'continue'});f.tick(1);f.tick(5);
    expect(frames).toMatchObject([{delta:0,width:200,pixelRatio:2},{delta:4,width:200,pixelRatio:2}]);
    f.view.dispose();expect(()=>link.canvas).toThrow(/disposed/);
  });
  it('reports a drawable size change before the next frame observers run',()=>{
    Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1});
    const f=fixture();const order:string[]=[];
    const link=f.view.fx.animation.manageDisplayLink(f.view.canvas,{drawableSizeDidChange:({width,height})=>order.push(`size ${width}x${height}`)});
    link.onFrame(({width})=>order.push(`frame ${width}`),{reducedMotion:'continue'});
    f.tick(1);f.resize({width:320,height:240});f.tick(2);
    expect(order).toEqual(['size 200x100','frame 200','size 320x240','frame 320']);
    expect(f.canvas.width).toBe(300);f.view.dispose();
  });
  it('redraws a static reduced-motion observer only when display is needed',()=>{
    const f=fixture();const link=f.view.fx.animation.manageDisplayLink(f.view.canvas);const frame=vi.fn();
    f.view[nseUpdateTraits]({reducedMotion:true,presentation:null});
    link.onFrame(frame,{reducedMotion:'static'});f.tick(1);f.tick(2);expect(frame).toHaveBeenCalledTimes(1);
    link.setNeedsDisplay();f.tick(3);f.tick(4);expect(frame).toHaveBeenCalledTimes(2);
    f.view.dispose();expect(()=>link.setNeedsDisplay()).toThrow(/disposed/);
  });
  it('gives one mounted canvas a renderer or a display link, never both',()=>{
    const f=fixture();const link=f.view.fx.animation.manageDisplayLink(f.view.canvas);
    expect(f.view.fx.animation.manageDisplayLink(f.view.canvas)).toBe(link);
    expect(()=>f.view.fx.animation.manageRenderer(f.view.canvas)).toThrow(/cannot also have a managed renderer/);
    expect(()=>f.view.fx.animation.manageDisplayLink(f.view.canvas,{drawableSizeDidChange:()=>{}})).toThrow(/different options/);
    expect(()=>f.view.fx.animation.manageDisplayLink(f.view.canvas,{maximumQuads:4} as never)).toThrow(/maximumQuads/);
    f.view.dispose();
    const g=fixture(0,0);g.view.fx.animation.manageRenderer(g.view.canvas);
    expect(()=>g.view.fx.animation.manageDisplayLink(g.view.canvas)).toThrow(/cannot also have a managed display link/);g.view.dispose();
  });
  it('routes callback failures to onRenderError and stops the link',()=>{
    const f=fixture();const onRenderError=vi.fn();const link=f.view.fx.animation.manageDisplayLink(f.view.canvas,{onRenderError});
    link.onFrame(()=>{throw new Error('scene failed');},{reducedMotion:'continue'});f.tick(1);
    expect(onRenderError).toHaveBeenCalledWith(expect.objectContaining({message:'scene failed'}));
    expect(link.getSnapshot().active).toBe(false);expect(f.pending.size).toBe(0);f.view.dispose();
  });
  it('releases frames on real unmount',async()=>{
    const f=fixture();const link=f.view.fx.animation.manageDisplayLink(f.view.canvas);link.onFrame(()=>{},{reducedMotion:'continue'});
    f.detach();await Promise.resolve();expect(link.getSnapshot().active).toBe(false);expect(f.pending.size).toBe(0);f.view.dispose();
  });
});
