import { describe, expect, it, vi } from 'vitest';
import { createBrowserViewportFeaturesSource } from '../../src/SynCloudOS/PlatformAdapters/BrowserViewportFeatures';
import { validateViewportFeatures } from '../../src/SynCloudOS/Windows/viewportFeatures';

function fixture(){
  const host=new EventTarget() as EventTarget & {navigator:object;screen:object;document:EventTarget;viewport:object};
  const posture=Object.assign(new EventTarget(),{type:'continuous'});
  host.navigator={devicePosture:posture};host.screen={orientation:new EventTarget()};host.document=new EventTarget();
  const regions=[{x:0,y:0,width:440,height:650},{x:460,y:0,width:440,height:650}];host.viewport={segments:regions};
  return {host,posture,regions,source:createBrowserViewportFeaturesSource(host as unknown as Window)};
}
describe('current browser viewport features seam',()=>{
  it('reports unavailable without browser globals or missing APIs',()=>{
    expect(createBrowserViewportFeaturesSource(null).getSnapshot()).toEqual({posture:null,segments:null});
    const f=fixture();f.host.navigator={};f.host.viewport={};f.host.dispatchEvent(new Event('resize'));
    const off=f.source.subscribe(()=>{});expect(f.source.getSnapshot()).toEqual({posture:null,segments:null});off();
  });
  it('does not use obsolete aliases or width to invent support',()=>{
    const f=fixture();f.host.navigator={};f.host.viewport={};Object.assign(f.host,{innerWidth:1800,getWindowSegments:()=>f.regions,visualViewport:{segments:f.regions}});
    const off=f.source.subscribe(()=>{});expect(f.source.getSnapshot()).toEqual({posture:null,segments:null});off();
  });
  it('updates stable immutable snapshots and removes each listener at final disposal',()=>{
    const f=fixture();const add=vi.spyOn(f.posture,'addEventListener'),remove=vi.spyOn(f.posture,'removeEventListener');
    const seen=vi.fn();const off=f.source.subscribe(seen);const off2=f.source.subscribe(()=>{});const initial=f.source.getSnapshot();
    f.host.dispatchEvent(new Event('resize'));expect(seen).not.toHaveBeenCalled();expect(f.source.getSnapshot()).toBe(initial);
    f.posture.type='folded';f.posture.dispatchEvent(new Event('change'));expect(seen).toHaveBeenCalledTimes(1);expect(f.source.getSnapshot().posture).toBe('folded');
    const frozen=f.source.getSnapshot();f.regions[0]!.width=200;expect(frozen.segments![0]!.width).toBe(440);expect(Object.isFrozen(frozen.segments![0])).toBe(true);
    off();expect(remove).not.toHaveBeenCalled();off2();expect(add).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);
    f.posture.type='continuous';f.posture.dispatchEvent(new Event('change'));expect(f.source.getSnapshot()).toBe(frozen);
    const again=f.source.subscribe(seen);expect(f.source.getSnapshot().posture).toBe('continuous');again();
  });
  it('contains independently throwing API getters without requesting permissions',()=>{
    const f=fixture();Object.defineProperty(f.host.navigator,'devicePosture',{get(){throw Error('restricted')}});
    const source=createBrowserViewportFeaturesSource(f.host as unknown as Window);expect(source.getSnapshot().posture).toBeNull();expect(source.getSnapshot().segments).toHaveLength(2);
    Object.defineProperty(f.host,'viewport',{get(){throw Error('unavailable')}});const off=source.subscribe(()=>{});expect(source.getSnapshot()).toEqual({posture:null,segments:null});off();
  });
  it('rejects malformed, excessive or viewport-external facts rather than retaining an old hinge',()=>{
    const f=fixture();const viewport={x:0,y:0,width:900,height:650};expect(validateViewportFeatures(f.source.getSnapshot(),viewport).segments).toHaveLength(2);
    for(const segments of [[{x:0,y:0,width:NaN,height:4}],[{x:0,y:0,width:9010,height:650}],Array(9).fill({x:0,y:0,width:1,height:1}),[]]){
      expect(validateViewportFeatures({posture:'folded',segments},viewport)).toEqual({posture:'folded',segments:null});
    }
  });
});
