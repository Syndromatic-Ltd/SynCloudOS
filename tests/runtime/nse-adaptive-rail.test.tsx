// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NSEAdaptiveNavigationController, NSENavigationStackController, NSETabBarController } from '../../src/NSE/Navigation';
import { NSESourceListScene } from '../../src/NSE/Navigation/SourceList';
import { createStaticPresentationTraits } from '../fixtures/presentationTraits';

afterEach(cleanup);
function tabs() {
  return new NSETabBarController<React.ReactNode>({ id:'rail-tabs', destinations: Array.from({length:7},(_,i)=>({
    id:`item-${i}`, label:`Destination ${i}`, accessibleLabel:`Destination ${i}`, disabled:i===1,
    icon:{kind:'vector' as const,path:'/test.svg'}, createContent:()=> <input aria-label={`Draft ${i}`} defaultValue='Unsaved' />,
  })) });
}
const traits = (width:number,height:number) => createStaticPresentationTraits({width,height});

describe('adaptive navigation rail',()=>{
  it('uses the allocated scene without transforms or host size and retains it while hidden',()=>{
    const controller=tabs();
    const adaptive=new NSEAdaptiveNavigationController({id:'allocation',model:'peer',tabController:controller,traits:traits(1440,900)});
    adaptive.setContentBounds({x:0,y:0,width:594,height:368});
    expect(adaptive.getSnapshot().renderer).toBe('rail');
    adaptive.setContentBounds({x:0,y:0,width:0,height:0});
    expect(adaptive.getSnapshot().layoutBounds.width).toBe(594);
    adaptive.setContentBounds(null);
    expect(adaptive.getSnapshot().renderer).toBe('source-list-content');
    adaptive.dispose();controller.dispose();
  });
  it.each([
    [382,580,'tabs'],[463,280,'tabs'],[464,280,'rail'],[594,368,'rail'],[669,867,'tabs'],
    [768,481,'source-list-content'],[768,480,'rail'],[480,480,'tabs'],[1000,180,'rail'],
  ])('selects content geometry %ix%i as %s',(width,height,renderer)=>{
    const controller=tabs();
    const adaptive=new NSEAdaptiveNavigationController({id:'policy',model:'peer',tabController:controller,traits:{...traits(width,height),horizontalSizeClass:'wide',hostViewportBounds:{x:0,y:0,width:1920,height:1080}}});
    expect(adaptive.getSnapshot().renderer).toBe(renderer);
    adaptive.dispose();controller.dispose();
  });

  it('retains a current decision through untrusted geometry and starts unavailable peers as tabs',()=>{
    const controller=tabs();
    const adaptive=new NSEAdaptiveNavigationController({id:'trust',model:'peer',tabController:controller,traits:traits(594,368)});
    adaptive.setTraits({...traits(1200,800),geometryState:'retained'});
    expect(adaptive.getSnapshot().renderer).toBe('rail');
    adaptive.setTraits(traits(1200,800));
    expect(adaptive.getSnapshot().renderer).toBe('source-list-content');
    const unavailable=new NSEAdaptiveNavigationController({id:'initial',model:'peer',tabController:controller,traits:{...traits(1200,800),geometryState:'unavailable'}});
    expect(unavailable.getSnapshot().renderer).toBe('tabs');
    unavailable.dispose();adaptive.dispose();controller.dispose();
  });

  it('honours fixed bottom tabs and keeps short hierarchy rectangles semantic stacks or list-detail',()=>{
    const controller=tabs();
    const fixed=new NSEAdaptiveNavigationController({id:'fixed',model:'peer',presentation:'bottom-tabs',tabController:controller,traits:traits(594,368)});
    const stack=new NSENavigationStackController({id:'hierarchy',rootDestinationId:'item-0',destinationIds:controller.destinations.map(d=>d.id)});
    const hierarchy=new NSEAdaptiveNavigationController({id:'adaptive-hierarchy',model:'hierarchy',tabController:controller,stackController:stack,traits:traits(594,368)});
    expect(fixed.getSnapshot().renderer).toBe('tabs');
    expect(hierarchy.getSnapshot().renderer).toBe('stack');
    hierarchy.setTraits(traits(1000,180));expect(hierarchy.getSnapshot().renderer).toBe('list-detail');
    hierarchy.dispose();stack.dispose();fixed.dispose();controller.dispose();
  });

  it('retains draft nodes, scroll, tab focus and More identity through rail/tabs/sidebar changes',async()=>{
    const controller=tabs();
    const adaptive=new NSEAdaptiveNavigationController({id:'retention',model:'peer',tabController:controller,traits:traits(382,580)});
    const view=render(<NSESourceListScene projection={{controller,adaptiveController:adaptive,ariaLabel:'Destinations'}}/>);
    const draft=screen.getByRole('textbox',{name:'Draft 0'}) as HTMLInputElement;
    fireEvent.change(draft,{target:{value:'Keep draft'}});draft.scrollTop=45;draft.focus();
    act(()=>adaptive.setTraits(traits(594,368)));
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical');
    expect(document.activeElement).toBe(draft);
    const tab=screen.getByRole('tab',{name:'Destination 0'});tab.focus();
    act(()=>adaptive.setTraits(traits(382,580)));
    expect(screen.getByRole('tab',{name:'Destination 0'})).toBe(tab);
    expect(document.activeElement).toBe(tab);
    act(()=>adaptive.setTraits(traits(594,368)));
    fireEvent.keyDown(tab,{key:'ArrowDown'});
    await waitFor(()=>expect(controller.getSnapshot().selectedDestinationId).toBe('item-2'));
    expect(document.activeElement).toBe(screen.getByRole('tab',{name:'Destination 2'}));
    await act(()=>controller.openOverflow());
    const moreStack=controller.moreStack;
    act(()=>adaptive.setTraits(traits(382,580)));
    expect(controller.moreStack).toBe(moreStack);
    expect(controller.moreStack?.getSnapshot().currentDestinationId).toBe('__nse-more');
    await act(()=>controller.select('item-0'));
    draft.focus();
    act(()=>adaptive.setTraits(traits(1200,800)));
    expect(screen.getByRole('textbox',{name:'Draft 0'})).toBe(draft);
    expect(draft.value).toBe('Keep draft');expect(draft.scrollTop).toBe(45);
    expect(document.activeElement).toBe(draft);
    expect(view.container.querySelector('[data-nse-source-list-compact-chrome]')?.hasAttribute('hidden')).toBe(true);
    adaptive.dispose();controller.dispose();
  });

  it('uses inherited RTL for horizontal keys while vertical keys remain in visual block order',async()=>{
    const controller=tabs();
    const adaptive=new NSEAdaptiveNavigationController({id:'rtl',model:'peer',tabController:controller,traits:traits(594,368)});
    const view=render(<div dir='rtl'><NSESourceListScene projection={{controller,adaptiveController:adaptive}}/></div>);
    const first=screen.getByRole('tab',{name:'Destination 0'});first.focus();
    fireEvent.keyDown(first,{key:'ArrowDown'});
    await waitFor(()=>expect(controller.getSnapshot().selectedDestinationId).toBe('item-2'));
    fireEvent.keyDown(screen.getByRole('tab',{name:'Destination 2'}),{key:'Home'});
    await waitFor(()=>expect(controller.getSnapshot().selectedDestinationId).toBe('item-0'));
    expect(view.container.querySelector('[data-nse-tab-bar]')?.hasAttribute('dir')).toBe(false);
    adaptive.dispose();controller.dispose();
  });
});
