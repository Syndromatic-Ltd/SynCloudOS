// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { resolveNSEBookRegions } from '../../src/NSE/Navigation/bookRegions';
import { tabViewController, renderTabController, updateTraits } from '../fixtures/tabViewController';
import { NSESplitView } from '../../src/NSE/DataViews/Split/NSESplitView';
import { createStaticPresentationTraits } from '../fixtures/presentationTraits';
import type { SynCloudOSPresentationTraits } from '../../src/SynCloudOS/SynCloudOS';

const rect=(x:number,y:number,width:number,height:number)=>({x,y,width,height});
const traits=(overrides:Partial<SynCloudOSPresentationTraits>={}):SynCloudOSPresentationTraits=>({
  ...createStaticPresentationTraits({width:900,height:650}),
  viewportFeatures:{posture:'folded',segments:[rect(0,0,440,650),rect(460,0,440,650)]},...overrides,
});
afterEach(cleanup);
describe('explicit capability book-region projection',()=>{
  it('clips reported physical regions into the actual offset scene and leaves the hinge empty',()=>{
    expect(resolveNSEBookRegions(traits(),rect(20,45,850,580))).toEqual({left:rect(0,0,420,580),right:rect(440,0,410,580)});
  });
  it('accepts a zero-width fold, unsorted segments and unequal usable widths',()=>{
    expect(resolveNSEBookRegions(traits({viewportFeatures:{posture:'folded',segments:[rect(400,0,500,650),rect(0,0,400,650)]}})))
      .toEqual({left:rect(0,0,400,650),right:rect(400,0,500,650)});
  });
  it.each([
    {viewportFeatures:undefined},
    {viewportFeatures:{posture:null,segments:[rect(0,0,440,650),rect(460,0,440,650)]}},
    {viewportFeatures:{posture:'continuous',segments:[rect(0,0,440,650),rect(460,0,440,650)]}},
    {viewportFeatures:{posture:'folded',segments:null}},
    {viewportFeatures:{posture:'folded',segments:[rect(0,0,900,650)]}},
    {viewportFeatures:{posture:'folded',segments:[rect(0,0,900,310),rect(0,340,900,310)]}},
    {viewportFeatures:{posture:'folded',segments:[rect(0,0,500,650),rect(450,0,450,650)]}},
    {viewportFeatures:{posture:'folded',segments:[rect(-1,0,441,650),rect(460,0,440,650)]}},
    {viewportFeatures:{posture:'folded',segments:[rect(0,0,440,650),rect(460,0,4410,650)]}},
    {viewportFeatures:{posture:'folded',segments:[rect(0,0,440,650),rect(NaN,0,440,650)]}},
    {geometryState:'retained'}, {geometryState:'unavailable'},
    {visualViewportBounds:rect(100,0,600,650)},
  ] as Partial<SynCloudOSPresentationTraits>[])('falls back without trustworthy spanning book facts (%j)',override=>{
    expect(resolveNSEBookRegions(traits(override))).toBeNull();
  });
  it('rejects one-region windows and unusably narrow/shallow intersections',()=>{
    for(const bounds of [rect(0,0,430,600),rect(400,0,500,600),rect(0,0,900,150),rect(0,0,NaN,500)]) expect(resolveNSEBookRegions(traits(),bounds)).toBeNull();
  });
  it('honours safe/visible area without assigning keyboard-occluded pixels',()=>{
    const value=traits({safeAreaInsets:{inlineStart:10,inlineEnd:15,blockStart:8,blockEnd:12},visualViewportBounds:rect(0,0,900,400)});
    expect(resolveNSEBookRegions(value)).toEqual({left:rect(10,8,430,392),right:rect(460,8,425,392)});
  });
  it('keeps responsive policies and fixed bottom tabs independent of book regions',()=>{
    const tabs=tabViewController({ids:['Note']});
    const book=traits({...createStaticPresentationTraits({width:669,height:867}),viewportFeatures:{posture:'folded',segments:[rect(0,0,329,867),rect(340,0,329,867)]}});
    const view=renderTabController(tabs,book);
    const renderer=()=>view.container.querySelector('[data-navigation-renderer]')?.getAttribute('data-navigation-renderer');
    expect(renderer()).toBe('source-list-content');expect(view.container.querySelector('[data-book-regions="true"]')).not.toBeNull();
    updateTraits(tabs,createStaticPresentationTraits({width:382,height:580}));expect(renderer()).toBe('tabs');
    updateTraits(tabs,createStaticPresentationTraits({width:951,height:585}));expect(renderer()).toBe('source-list-content');
    act(()=>{tabs.tabStyle='segmentedControlOnBottom';});
    updateTraits(tabs,book);
    expect(view.container.querySelector('[data-book-regions="true"]')).toBeNull();
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('horizontal');
    tabs.dispose();
  });
  it('retains the document node, draft, scroll and focus through repeated book/fallback transitions',()=>{
    const tabs=tabViewController({ids:['Note'],content:()=> <textarea aria-label='Draft' defaultValue='Original'/>});
    const view=renderTabController(tabs,createStaticPresentationTraits({width:382,height:580}));
    const draft=screen.getByRole('textbox',{name:'Draft'}) as HTMLTextAreaElement;
    fireEvent.change(draft,{target:{value:'Unsaved'}});draft.scrollTop=24;draft.focus();
    for(let i=0;i<6;i++){
      updateTraits(tabs,traits());expect(view.container.querySelector('[data-book-regions="true"]')).not.toBeNull();
      updateTraits(tabs,createStaticPresentationTraits({width:382,height:580}));
    }
    expect(screen.getByRole('textbox',{name:'Draft'})).toBe(draft);expect(draft.value).toBe('Unsaved');expect(draft.scrollTop).toBe(24);expect(document.activeElement).toBe(draft);
    tabs.dispose();
  });
  it('constrains the existing split without overwriting normal width or exposing a hinge resizer',()=>{
    const regions=resolveNSEBookRegions(traits())!;
    const view=render(<NSESplitView sidebar={<button>List</button>} defaultSidebarWidth={300}><textarea aria-label='Split draft'/></NSESplitView>);
    const separator=screen.getByRole('separator');fireEvent.keyDown(separator,{key:'ArrowRight'});expect(separator.getAttribute('aria-valuenow')).toBe('316');
    const draft=screen.getByRole('textbox',{name:'Split draft'});draft.focus();
    view.rerender(<NSESplitView sidebar={<button>List</button>} defaultSidebarWidth={300} bookRegions={regions}><textarea aria-label='Split draft'/></NSESplitView>);
    expect(screen.queryByRole('separator')).toBeNull();expect(screen.getByRole('textbox',{name:'Split draft'})).toBe(draft);expect(document.activeElement).toBe(draft);
    view.rerender(<NSESplitView sidebar={<button>List</button>} defaultSidebarWidth={300}><textarea aria-label='Split draft'/></NSESplitView>);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('316');
  });
});
