import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createContentBoundPresentationTraitsService, type SynCloudOSRuntime, type WindowBounds } from '../../SynCloudOS/SynCloudOS';
import { ResponderScope, useKernelSynCloudOS, useRuntimeNSEOverlayPort } from '../../SynCloudOSReact';
import { NSEAdaptiveNavigationController, NSEOverlayProvider, NSEPopover, NSESourceListScene, NSETabBarController, NSEViewController, nseUnowned, useNSEDeferredDisposal } from '../../NSE/NSE';

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

class NavigationFixtureController extends NSEViewController {
  #bounds: WindowBounds = {x:0,y:0,width:1,height:1};
  #listeners = new Set<()=>void>();
  readonly presentation;
  readonly tabs: NSETabBarController<ReactNode>;
  readonly adaptive: NSEAdaptiveNavigationController<ReactNode>;
  constructor(runtime: SynCloudOSRuntime) {
    super({owner:nseUnowned});
    this.presentation=createContentBoundPresentationTraitsService({
      contentBounds:{getSnapshot:()=>this.#bounds,subscribe:listener=>{const notify=()=>listener(this.#bounds);this.#listeners.add(notify);return()=>this.#listeners.delete(notify);}},
      screen:runtime.screen,matchMedia:runtime.environment.matchMedia,requestAnimationFrame:runtime.environment.requestAnimationFrame,cancelAnimationFrame:runtime.environment.cancelAnimationFrame,
    });
    this.tabs=this.addChild(NSETabBarController<ReactNode>,{id:'fixture-peers',destinations:['Editor','Library','Search','Settings','Activity','Sharing','History'].map(id=>({
      id,label:id,accessibleLabel:id,disabled:id==='Search',icon:{kind:'vector' as const,path:'/src/NSE/Navigation/nse-tab-bar-more.svg'},createContent:()=> <Draft id={id}/>,
    }))});
    this.adaptive=this.addChild(NSEAdaptiveNavigationController<ReactNode>,{id:'fixture-adaptive',model:'peer',tabController:this.tabs,traits:this.presentation.getSnapshot()});
    const unsubscribe=this.presentation.subscribe(()=>this.adaptive.setTraits(this.presentation.getSnapshot()));
    this.own(()=>({dispose:()=>{unsubscribe();this.presentation.dispose();}}));
  }
  measure(element:HTMLElement) {const bounds=element.getBoundingClientRect();this.#bounds={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};this.#listeners.forEach(listener=>listener());}
}

export function AdaptiveNavigationFixture() {
  const runtime=useKernelSynCloudOS();
  const overlayPort=useRuntimeNSEOverlayPort();
  const [controller]=useState(()=>new NavigationFixtureController(runtime));
  const [element,setElement]=useState<HTMLDivElement|null>(null);
  const [width,setWidth]=useState('');
  const [rtl,setRTL]=useState(false);
  const snapshot=useSyncExternalStore(listener=>controller.adaptive.subscribe(listener),controller.adaptive.getSnapshot,controller.adaptive.getSnapshot);
  useNSEDeferredDisposal(controller);
  useEffect(()=>{
    if(!element)return;
    const observer=new ResizeObserver(()=>controller.measure(element));
    observer.observe(element);controller.measure(element);return()=>observer.disconnect();
  },[controller,element]);
  return <NSEOverlayProvider runtimePort={overlayPort}><ResponderScope responderId='fixture:navigation' kind='application' scopeId='root'>
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#e9edf2',color:'#20242a'}}>
      <div style={{height:40,flex:'none',display:'flex',gap:12}}>
        <label>Content width <input aria-label='Content width' value={width} onChange={event=>setWidth(event.target.value)} style={{width:65}} /></label>
        <label>RTL <input type='checkbox' aria-label='RTL' checked={rtl} onChange={event=>setRTL(event.target.checked)}/></label>
        <output data-testid='navigation-state'>{snapshot.renderer}:{snapshot.selectedDestinationId}</output>
      </div>
      <div ref={setElement} dir={rtl?'rtl':'ltr'} data-testid='navigation-window' style={{width:width?`${width}px`:'100%',maxWidth:'100%',flex:'1',minHeight:0}}>
        <NSESourceListScene projection={{controller:controller.tabs,adaptiveController:controller.adaptive,ariaLabel:'Workspace'}} status={{rail:'Destinations',leading:'Ready'}} />
      </div>
    </div>
  </ResponderScope></NSEOverlayProvider>;
}
