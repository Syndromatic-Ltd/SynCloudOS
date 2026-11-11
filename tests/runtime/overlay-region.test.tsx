// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {resolveNSEOverlayRegion,nseOverlayRegionInsets} from '../../src/NSE/Overlays/overlayRegion';
import {useNSEOverlayRegion} from '../../src/NSE/Overlays/useNSEOverlayRegion';
import {createStaticPresentationTraits} from '../fixtures/presentationTraits';
import type {SynCloudOSPresentationTraits} from '../../src/SynCloudOS/SynCloudOS';
const r=(x:number,y:number,width:number,height:number)=>({x,y,width,height});
const traits=(partial:Partial<SynCloudOSPresentationTraits>={}):SynCloudOSPresentationTraits=>({...createStaticPresentationTraits({width:900,height:700}),viewportFeatures:{posture:'folded',segments:[r(0,0,440,700),r(460,0,440,700)]},...partial});
function source(initial=traits()){
 let value=initial;const listeners=new Set<()=>void>();
 return {getSnapshot:()=>value,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},set(next:SynCloudOSPresentationTraits){value=next;for(const fn of [...listeners])fn();},listeners:()=>listeners.size};
}
afterEach(cleanup);
describe('shared overlay region selection',()=>{
 it.each([['ltr','left',r(20,20,40,40),0],['rtl','left',r(20,20,40,40),0],['ltr','right',r(800,20,40,40),460],['rtl','right',r(800,20,40,40),460]] as const)('follows a %s origin on physical %s', (direction,_side,origin,x)=>expect(resolveNSEOverlayRegion(traits(),origin,direction)?.x).toBe(x));
 it('uses owning allocation rather than another window or an invented posture',()=>{
  expect(resolveNSEOverlayRegion(traits({contentBounds:r(480,50,300,400)}))?.x).toBe(460);
  expect(resolveNSEOverlayRegion(traits({contentBounds:r(480,50,300,400)}),r(-500,0,20,20))?.x).toBe(460);
  expect(resolveNSEOverlayRegion(traits({contentBounds:r(480,50,300,400)}),r(440,10,20,20))?.x).toBe(460);
 });
 it('uses logical leading only when both origin and owner remain ambiguous',()=>{
  expect(resolveNSEOverlayRegion(traits(),null,'ltr')?.x).toBe(0);expect(resolveNSEOverlayRegion(traits(),null,'rtl')?.x).toBe(460);
 });
 it.each([undefined,{posture:null,segments:[r(0,0,440,700),r(460,0,440,700)]},{posture:'continuous',segments:[r(0,0,440,700),r(460,0,440,700)]},{posture:'folded',segments:null},{posture:'folded',segments:[r(0,0,900,700)]}] as SynCloudOSPresentationTraits['viewportFeatures'][])('retains old fallback without valid book facts (%j)',viewportFeatures=>expect(resolveNSEOverlayRegion(traits({viewportFeatures}))).toBeNull());
 it('rejects retained/invalid owner geometry and clips keyboard/safe boundaries once',()=>{
  expect(resolveNSEOverlayRegion(traits({geometryState:'retained'}))).toBeNull();expect(resolveNSEOverlayRegion(traits({contentBounds:r(0,0,NaN,500)}))).toBeNull();
  const value=traits({visualViewportBounds:r(0,0,900,400),virtualKeyboardInset:300,safeAreaInsets:{inlineStart:10,inlineEnd:15,blockStart:5,blockEnd:0}});
  const region=resolveNSEOverlayRegion(value,r(800,10,40,40))!;expect(region).toEqual(r(460,5,425,395));expect(nseOverlayRegionInsets(region,value.hostViewportBounds)).toEqual({left:460,right:15,top:5,bottom:300});
 });
 it.each(['ltr','rtl'] as const)('positions global book alerts in logical trailing for %s independently of origin',direction=>{
  for(const origin of [r(20,20,40,40),r(800,20,40,40),null]) expect(resolveNSEOverlayRegion(traits(),origin,direction,'alert')?.x).toBe(direction==='rtl'?0:460);
 });
 it('uses upper tabletop for alerts and preserves contextual source relationships',()=>{
  const value=traits({viewportFeatures:{posture:'folded',segments:[r(0,360,900,340),r(0,0,900,340)]}});
  expect(resolveNSEOverlayRegion(value,r(50,500,40,40),'ltr','alert')).toEqual(r(0,0,900,340));
  expect(resolveNSEOverlayRegion(value,r(50,500,40,40),'rtl','alert')).toEqual(r(0,0,900,340));
  expect(resolveNSEOverlayRegion(value,r(50,500,40,40))).toEqual(r(0,360,900,340));
  expect(resolveNSEOverlayRegion(value,r(50,30,40,40))).toEqual(r(0,0,900,340));
 });
 it('rejects unusable/diagonal/overlapping tabletop regions and incomplete alert signals',()=>{
  for(const viewportFeatures of [
   {posture:'folded',segments:[r(0,0,900,150),r(0,170,900,530)]},
   {posture:'folded',segments:[r(0,0,850,340),r(50,360,850,340)]},
   {posture:'folded',segments:[r(0,0,900,380),r(0,360,900,340)]},
   {posture:null,segments:[r(0,0,900,340),r(0,360,900,340)]},
   {posture:'continuous',segments:[r(0,0,900,340),r(0,360,900,340)]},
  ] as SynCloudOSPresentationTraits['viewportFeatures'][])expect(resolveNSEOverlayRegion(traits({viewportFeatures}),null,'ltr','alert')).toBeNull();
 });
 it('keeps an opening origin through trapping, removal and posture changes',()=>{
  const s=source(),origin=document.createElement('button');origin.getBoundingClientRect=()=>({...r(800,20,40,40),top:20,right:840,bottom:60,left:800,toJSON(){return this;}});document.body.append(origin);origin.focus();
  function Probe(){const value=useNSEOverlayRegion({source:s,open:true,document});return <output data-testid='region'>{value.region?.x??'fallback'}</output>;}
  const view=render(<Probe/>);expect(screen.getByTestId('region').textContent).toBe('460');
  const trapped=document.createElement('input');document.body.append(trapped);trapped.focus();origin.remove();
  act(()=>s.set(traits({viewportFeatures:undefined})));expect(screen.getByTestId('region').textContent).toBe('fallback');
  act(()=>s.set(traits()));expect(screen.getByTestId('region').textContent).toBe('460');expect(document.activeElement).toBe(trapped);
  view.unmount();expect(s.listeners()).toBe(0);trapped.remove();
 });
 it('releases the old source and discards old origin evidence when ownership changes',()=>{
  const a=source(),b=source(traits({contentBounds:r(480,50,300,400)})),origin=document.createElement('button');origin.getBoundingClientRect=()=>({...r(20,20,40,40),top:20,right:60,bottom:60,left:20,toJSON(){return this;}});document.body.append(origin);origin.focus();
  function Probe({port}:{port:typeof a}){const value=useNSEOverlayRegion({source:port,open:true,document});return <output data-testid='region'>{value.region?.x}</output>;}
  const view=render(<Probe port={a}/>);expect(screen.getByTestId('region').textContent).toBe('0');
  view.rerender(<Probe port={b}/>);expect(a.listeners()).toBe(0);expect(b.listeners()).toBe(1);expect(screen.getByTestId('region').textContent).toBe('460');
  act(()=>a.set(traits()));expect(screen.getByTestId('region').textContent).toBe('460');view.unmount();expect(b.listeners()).toBe(0);origin.remove();
 });
 it('observes no closed source and contains a missing or throwing provider',()=>{
  const s=source();function Probe({open}:{open:boolean}){const value=useNSEOverlayRegion({source:s,open,document});return <output data-testid='region'>{value.region?.x??'fallback'}</output>;}
  const view=render(<Probe open={false}/>);expect(s.listeners()).toBe(0);view.rerender(<Probe open/>);expect(s.listeners()).toBe(1);view.rerender(<Probe open={false}/>);expect(s.listeners()).toBe(0);view.unmount();
  const broken={getSnapshot():SynCloudOSPresentationTraits{throw Error('retired')},subscribe(){throw Error('retired')}};
  function Missing(){const value=useNSEOverlayRegion({source:broken,open:true,document});return <output>{value.region?'wrong':'unavailable'}</output>;}
  render(<Missing/>);expect(screen.getByText('unavailable')).toBeTruthy();
 });
});
