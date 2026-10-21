import React, { useMemo, useState, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { useNSEVisualEnvironment, projectNSETheme } from "../../../src/NSE/Appearance";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { SynCloudOSProvider } from "../../../src/SynCloudOSReact/SynCloudOSProvider";
import { NSEAnimationEnvironmentProvider } from "../../../src/NSE/Animation/NSEAnimationEnvironment";
import { NSEThemeProvider, neutralNSETheme } from "../../../src/NSE/Appearance/NSEThemeProvider";
import type { NSEAppearance } from "../../../src/NSE/Appearance/nseAppearanceTypes";
import { atmoTheme } from "../../../src/NSE/Themes/Atmo";
import { metroTheme } from "../../../src/NSE/Themes/Metro";
import { NSESourceListScene } from "../../../src/NSE/Navigation/SourceList";
import { NSEAdaptiveNavigationController } from "../../../src/NSE/Navigation/NSEAdaptiveNavigationController";
import { NSETabBarController } from "../../../src/NSE/Navigation/NSETabBarController";
import { NSEPushButton, NSECheckbox, NSERadioGroup, NSEToggleButton, NSESlider, NSETextField,
  NSEProgressBar, NSEPicker, NSEMenu, NSEStandaloneControlHost, NSEPopup } from "../../../src/NSE/public/controls";
import { NSETopBar } from "../../../src/NSE/Windows/Chrome/NSETopBar";
import { NSEToolbar } from "../../../src/NSE/Toolbars/NSEToolbar";
import { NSEStandardWindowView } from "../../../src/NSE/Windows/NSEStandardWindowView";
import type { WindowRecord, WindowPresentation } from "../../../src/SynCloudOS/Windows";
import { LoginWindow } from "../../../src/NSE/SystemUI/LoginWindow/LoginWindow";
import { createStaticPresentationTraits } from "../../fixtures/presentationTraits";
import "../../../src/NSE/public/styles.css";
import "./theme-gallery.css";

const runtime = createSynCloudOS({ id: "theme-laboratory", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" });

function ControlCollection() {
  const [count, setCount] = useState(0);
  const [value, setValue] = useState(62);
  return <section className="gallery-page" data-nse-navigation-scroll-surface="true" aria-label="Control collection">
    <p className="gallery-kicker">SYNCLOUDOS / STANDARD CONTROLS</p><h1>make it yours.</h1>
    <p className="gallery-lead">The same controls. A different visual language.</p>
    <div className="gallery-grid">
      <section><h2>action</h2><div className="gallery-row"><NSEPushButton onClick={() => setCount(count + 1)}>Create</NSEPushButton><NSEPushButton tone="affirmative">Save</NSEPushButton><NSEPushButton disabled>Unavailable</NSEPushButton></div><output aria-live="polite">{count} created</output>
      <h2>selection</h2><NSECheckbox label="Keep me up to date" defaultChecked /><NSECheckbox label="Mixed selection" mixed /><NSECheckbox label="Not available" disabled />
      <NSERadioGroup label="Download quality" defaultValue="high" options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High quality" }]} />
      <div className="gallery-row"><span>Sync automatically</span><NSEToggleButton aria-label="Sync automatically" defaultChecked /></div>
      </section>
      <section><h2>input</h2><NSETextField aria-label="Display name" placeholder="Your name" /><NSETextField aria-label="Disabled field" placeholder="Unavailable" disabled />
      <h2>adjust</h2><NSESlider label="Volume" value={value} onValueChange={setValue} /><output>Volume {value}%</output>
      <NSEProgressBar label="Download progress" value={value} />
      <h2>choose</h2><div className="gallery-row"><NSEPicker label="Choose collection" options={[{ value: "recent", label: "Recently added" }, { value: "favourites", label: "Favourites" }]} defaultValue="recent" />
      <NSEMenu label="More actions" items={[{ value: "share", label: "Share" }, { value: "rename", label: "Rename" }, { value: "delete", label: "Delete", disabled: true }]} /></div></section>
    </div>
  </section>;
}
function Notes() {
  const [text, setText] = useState("");
  return <section className="gallery-page" data-nse-navigation-scroll-surface="true"><p className="gallery-kicker">RETAINED DESTINATION</p><h1>keep your place.</h1><p className="gallery-lead">Type a note, change tabs, then switch the theme or appearance. Your note stays.</p><textarea className="gallery-note" aria-label="Retained note" value={text} onChange={e => setText(e.target.value)} placeholder="Something worth remembering…" /><output>{text.length} characters</output><div className="gallery-scroll" tabIndex={0} aria-label="Retained scrolling area">{Array.from({length:24},(_,i)=><p key={i}>Item {String(i+1).padStart(2,"0")} · Content remains mounted while you explore.</p>)}</div></section>;
}
function Surfaces() {
  const visualEnvironment = useNSEVisualEnvironment();
  const [dialog, setDialog] = useState(false), [login, setLogin] = useState(false), [message, setMessage] = useState("");
  const record: WindowRecord = { id:"gallery-window",runtimeId:runtime.runtimeId,workspaceId:"gallery",applicationId:null,applicationSessionId:null,documentId:null,documentAssociationRole:null,representedDocument:null,toolbar:null,role:"standard",style:["titled","closable","minimisable","zoomable"],title:"Documents",content:{rendererId:"gallery",parameters:{}},bounds:{x:0,y:0,width:640,height:300},minimumSize:{width:240,height:160},maximumSize:null,level:"normal",parentWindowControllerId:null,anchor:null,pinned:false,state:"open",isKey:true,isMain:true,zIndex:1,mobilePolicy:"fullscreen",restorationKey:null,chromeMode:"system",smoothSurface:null };
  const presentation: WindowPresentation = {kind:"desktop-window",visible:true,bounds:record.bounds,safeAreaInsets:{blockStart:0,inlineEnd:0,blockEnd:0,inlineStart:0},movable:false,resizable:false,titleBarVisible:true};
  return <section className="gallery-page" data-nse-navigation-scroll-surface="true"><p className="gallery-kicker">SYSTEM SURFACES</p><h1>one language.</h1>
    <div className="gallery-topbar-preview"><NSETopBar title="Workspace" leadingItems={[{kind:"webspring",label:"Home",onClick:()=>setMessage("Home selected")}]} trailingItems={[{kind:"settings",label:"Settings",onClick:()=>setDialog(true)}]} /></div>
    <NSEToolbar composition="children" aria-label="Document tools"><NSEPushButton onClick={()=>setMessage("New document created")}>New</NSEPushButton><NSEPushButton onClick={()=>setDialog(true)}>Share</NSEPushButton><NSEPushButton onClick={()=>setLogin(true)}>Sign in preview</NSEPushButton></NSEToolbar>
    <div className="gallery-window"><NSEStandardWindowView record={record} presentation={presentation} blocked={false} dirty={false} dispatchCommand={async command=>setMessage(`Window control: ${command}`)}><div style={{padding:24}}><h2>Document window</h2><p>Real window chrome and command controls, with app-owned content inside.</p><NSETextField aria-label="Document title" defaultValue="Untitled document" /></div></NSEStandardWindowView></div>
    <output aria-live="polite">{message}</output>
    <NSEPopup open={dialog} onOpenChange={setDialog} title="Share this document" modal><p>Choose an action. This preview does not send any data.</p><div className="gallery-row"><NSEPushButton onClick={()=>setDialog(false)}>Cancel</NSEPushButton><NSEPushButton tone="affirmative" onClick={()=>{setDialog(false);setMessage("Preview confirmed");}}>Confirm</NSEPushButton></div></NSEPopup>
    {login ? createPortal(<div {...projectNSETheme(visualEnvironment)} className="gallery-login-portal nse-theme-provider"><LoginWindow title="Welcome back" methods={[{id:"preview",label:"Preview account"}]} onMethodSignIn={()=>setMessage("Preview only: no authentication request sent")} onCancel={()=>setLogin(false)} /></div>, document.body) : null}
  </section>;
}
function About() {
  return <section className="gallery-page" data-nse-navigation-scroll-surface="true"><p className="gallery-kicker">THEME PACKAGES</p><h1>content first.</h1><p className="gallery-lead">Atmo and Metro are independent peers. Appearance selects light or dark within either theme.</p><h2>Built from real framework components</h2><p>This is a live source-backed test gallery, not a screenshot or a separate set of look-alike controls. The surrounding laboratory controls belong to the demo, not the selected theme.</p><h2>Motion with purpose</h2><p>Navigate quickly to interrupt a transition. Turn on reduced motion to remove movement. Keyboard focus and destination state remain semantic and stable.</p><h2>Application freedom</h2><div style={{padding:24,background:"#102e40",color:"#fff",borderRadius:16}}>This deliberately custom app-owned card keeps its own design. Themes do not forcibly rewrite custom application UI.</div></section>;
}
function Gallery() {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const [themeId,setThemeId]=useState("metro"); const [appearance,setAppearance]=useState<NSEAppearance>("dark");
  const [phone,setPhone]=useState(false); const [reduced,setReduced]=useState(false); const [rtl,setRtl]=useState(false);
  const theme = themeId === "metro" ? metroTheme : themeId === "atmo" ? atmoTheme : neutralNSETheme;
  const controller=useMemo(()=>new NSETabBarController<ReactNode>({id:"theme-gallery",destinations:[
    {id:"collection",label:"collection",icon:{kind:"template",name:"grid"},createContent:()=> <ControlCollection />},
    {id:"notes",label:"notes",icon:{kind:"template",name:"document"},createContent:()=> <Notes />},
    {id:"surfaces",label:"surfaces",icon:{kind:"template",name:"window"},createContent:()=> <Surfaces />},
    {id:"about",label:"about",icon:{kind:"template",name:"info"},createContent:()=> <About />},
  ]}),[]);
  const presentation=useMemo(()=>{
    const contentWidth = Math.min(viewport.width, phone ? 390 : 1280);
    const traits = createStaticPresentationTraits({width:contentWidth,height:viewport.height,reducedMotion:reduced});
    const hostBounds = Object.freeze({x:0,y:0,width:viewport.width,height:viewport.height});
    // Phone preview constrains content, not the browser's overlay work area.
    const snapshot = Object.freeze({...traits,hostViewportBounds:hostBounds,workArea:hostBounds,visualViewportBounds:hostBounds});
    return Object.freeze({getSnapshot:()=>snapshot,subscribe:()=>()=>undefined});
  },[phone,reduced,viewport]);
  const adaptive = useMemo(() => new NSEAdaptiveNavigationController<ReactNode>({ id: "gallery-adaptive", model: "peer", tabController: controller, traits: presentation.getSnapshot() }), [controller]);
  useEffect(() => { adaptive.setTraits(presentation.getSnapshot()); }, [adaptive, presentation]);
  return <><header className="lab-toolbar"><div><strong>SynCloudOS</strong><span>Theme laboratory</span></div><div className="lab-options">
    <label>Theme<select aria-label="Theme" value={themeId} onChange={e=>setThemeId(e.target.value)}><option value="metro">Metro</option><option value="atmo">Atmo</option><option value="neutral">Neutral</option></select></label>
    <label>Appearance<select aria-label="Appearance" value={appearance} onChange={e=>setAppearance(e.target.value as NSEAppearance)}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <label><input type="checkbox" checked={phone} onChange={e=>setPhone(e.target.checked)}/>Phone width</label>
    <label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>Reduced motion</label>
    <label><input type="checkbox" checked={rtl} onChange={e=>setRtl(e.target.checked)}/>RTL</label>
  </div></header><main className="lab-stage"><div className="lab-device" data-phone={phone}>
    <NSEAnimationEnvironmentProvider reducedMotion={reduced}><NSEThemeProvider theme={theme} appearance={appearance}><NSEStandaloneControlHost document={document} window={window} presentation={presentation}>
      <div className="gallery-surface" dir={rtl?"rtl":"ltr"}><NSESourceListScene projection={{ controller, adaptiveController: adaptive, ariaLabel: "Gallery destinations", title: "syncloudos" }} /></div>
    </NSEStandaloneControlHost></NSEThemeProvider></NSEAnimationEnvironmentProvider>
  </div></main></>;
}
createRoot(document.getElementById("root")!).render(<SynCloudOSProvider runtime={runtime}><Gallery /></SynCloudOSProvider>);
import.meta.hot?.dispose(() => { void runtime.dispose("theme gallery reload"); });
