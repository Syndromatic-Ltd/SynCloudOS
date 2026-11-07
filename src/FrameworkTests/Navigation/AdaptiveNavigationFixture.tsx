import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createContentBoundPresentationTraitsService, type SynCloudOSRuntime, type WindowBounds } from '../../SynCloudOS/SynCloudOS';
import { ResponderScope, useKernelSynCloudOS, useRuntimeNSEOverlayPort } from '../../SynCloudOSReact';
import { NSEOverlayProvider, NSETabViewController, NSETabViewItem, NSEViewController, nseUnowned, useNSEDeferredDisposal } from '../../NSE/NSE';
import { nseUpdateTraits } from '../../NSE/Application/NSEViewController';
import { NSEViewControllerView } from '../../SynCloudOS/AppHosting/applicationHosting';
import { NSEPopover } from '../../NSE/Overlays/NSEPopover';

function Draft({ id }: { id: string }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return <div data-nse-navigation-scroll-surface='true' data-testid={`scroll-${id}`} style={{height:'100%',overflow:'auto',boxSizing:'border-box',padding:16}}>
    <h1>{id}</h1><label>Unsaved draft <input aria-label={`Draft ${id}`} defaultValue='Keep this document' /></label>
    <button ref={setAnchor} onClick={()=>setOpen(true)}>Open draft options</button>
    <NSEPopover id={`navigation-options-${id}`} open={open} anchor={anchor} parentWindowControllerId={null} parentResponderId='fixture:navigation' title='Draft options' labelledBy={`options-title-${id}`} onOpenChange={setOpen} contentSize={{width:260,height:180}}>
      <h2 id={`options-title-${id}`}>Draft options</h2>
      <input aria-label='Option draft' defaultValue='Retain options' /><button onClick={()=>setOpen(false)}>Done</button>
    </NSEPopover>
    <div style={{height:600}}>Scrollable retained content</div><button>Document end</button>
  </div>;
}

class DraftViewController extends NSEViewController {
  constructor(readonly id: string) { super({ title: id }); }
  renderView() { return <Draft id={this.id} />; }
}

class NavigationFixtureController extends NSETabViewController {
  #bounds: WindowBounds = {x:0,y:0,width:1,height:1};
  #listeners = new Set<()=>void>();
  readonly presentation;
  constructor(runtime: SynCloudOSRuntime) {
    super({owner:nseUnowned,title:'Workspace',tabStyle:'sidebarAdaptable'});
    this.presentation=createContentBoundPresentationTraitsService({
      contentBounds:{getSnapshot:()=>this.#bounds,subscribe:listener=>{const notify=()=>listener(this.#bounds);this.#listeners.add(notify);return()=>this.#listeners.delete(notify);}},
      screen:runtime.screen,matchMedia:runtime.environment.matchMedia,requestAnimationFrame:runtime.environment.requestAnimationFrame,cancelAnimationFrame:runtime.environment.cancelAnimationFrame,
    });
    for(const id of ['Editor','Library','Search','Settings','Activity','Sharing','History']) {
      this.addTabViewItem(new NSETabViewItem({identifier:id,label:id,image:{kind:'vector',path:'/src/NSE/Navigation/nse-tab-bar-more.svg'},viewController:this.addChild(DraftViewController,id)}));
    }
    const update=()=>{const presentation=this.presentation.getSnapshot();this[nseUpdateTraits]({presentation,reducedMotion:presentation.reducedMotion});};
    const unsubscribe=this.presentation.subscribe(update);
    update();
    this.own(()=>({dispose:()=>{unsubscribe();this.presentation.dispose();}}));
  }
  override shouldSelect(item:NSETabViewItem) { return item.identifier!=='Search'; }
  measure(element:HTMLElement) {const bounds=element.getBoundingClientRect();this.#bounds={x:bounds.x,y:bounds.y,width:element.clientWidth,height:element.clientHeight};this.#listeners.forEach(listener=>listener());}
}

export function AdaptiveNavigationFixture() {
  const runtime=useKernelSynCloudOS();
  const overlayPort=useRuntimeNSEOverlayPort();
  const [controller]=useState(()=>new NavigationFixtureController(runtime));
  const [element,setElement]=useState<HTMLDivElement|null>(null);
  const [width,setWidth]=useState('');
  const [rtl,setRTL]=useState(false);
  const snapshot=useSyncExternalStore(controller.subscribe,()=>controller.getSnapshot(),()=>controller.getSnapshot());
  const [renderer,setRenderer]=useState('tabs');
  useNSEDeferredDisposal(controller);
  useEffect(()=>{
    if(!element)return;
    const observer=new ResizeObserver(()=>controller.measure(element));
    observer.observe(element);controller.measure(element);
    // The test probe observes the actual theme projection instead of duplicating its policy.
    const read=()=>setRenderer(element.querySelector('[data-navigation-renderer]')?.getAttribute('data-navigation-renderer')??'tabs');
    const projection=new MutationObserver(read);projection.observe(element,{subtree:true,attributes:true,attributeFilter:['data-navigation-renderer']});read();
    return()=>{observer.disconnect();projection.disconnect();};
  },[controller,element]);
  return <NSEOverlayProvider runtimePort={overlayPort}><ResponderScope responderId='fixture:navigation' kind='application' scopeId='root'>
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#e9edf2',color:'#20242a'}}>
      <div style={{height:40,flex:'none',display:'flex',gap:12}}>
        <label>Content width <input aria-label='Content width' value={width} onChange={event=>setWidth(event.target.value)} style={{width:65}} /></label>
        <label>RTL <input type='checkbox' aria-label='RTL' checked={rtl} onChange={event=>setRTL(event.target.checked)}/></label>
        <output data-testid='navigation-state'>{renderer}:{snapshot.selectedIdentifier}</output>
      </div>
      <div ref={setElement} dir={rtl?'rtl':'ltr'} data-testid='navigation-window' style={{width:width?`${width}px`:'100%',maxWidth:'100%',flex:'1',minHeight:0}}>
        <NSEViewControllerView controller={controller} />
      </div>
    </div>
  </ResponderScope></NSEOverlayProvider>;
}
