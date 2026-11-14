import React, { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Appearance/atmo";
import { AnimationEnvironmentProvider } from "../../../../src/NSE/Animation/NSEAnimationEnvironment";
import { createBrowserAFXFrameScheduler } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { NSEViewController, nseUpdateTraits } from "../../../../src/NSE/Application/NSEViewController";
import { NSESplitViewController, NSESplitViewItem } from "../../../../src/NSE/DataViews/Split";
import { ViewControllerView } from "../../../../src/SynCloudOS/AppHosting/applicationHosting";
import { WindowTitlebarView } from "../../../../src/NSE/Windows/WindowTitlebarView";
import { createStaticPresentationTraits } from "../../../fixtures/presentationTraits";
import "../../../../src/NSE/public/styles.css";
import "./study.css";

const parameters = new URLSearchParams(location.search);
const scheme = parameters.get("scheme") === "dark" ? "dark" : "light";
const material = parameters.get("material") === "metal" ? "metal" : "cumulus";
const frames = createBrowserAFXFrameScheduler(window, document);
const lifetime = { mounts: 0, unmounts: 0 };
function Pane({ role, controller }: { role: "sidebar" | "content" | "inspector"; controller: NSESplitViewController }) {
  useEffect(() => { lifetime.mounts += 1; return () => { lifetime.unmounts += 1; }; }, []);
  return <div className={`study-pane study-pane-${role}`}>
    {role === "sidebar" ? <><h2>Library</h2><p className="study-caption">PROJECT NOTES</p>
      <button className="study-selected" onClick={() => { controller.compactItem = controller.splitViewItems[1]!; }}>Open document</button>
      <button>Field notes</button><button>Sketchbook</button><p className="study-caption">COLLECTIONS</p><button>Recent</button><button>Archive</button>
    </> : role === "content" ? <><p className="study-caption">DOCUMENT</p><h1>Window study</h1>
      <label className="study-editor-label">Document text<textarea defaultValue={"A window keeps its editor as its surroundings change.\n\nCollapse the inspector or sidebar, then open it again. This text and the inspector draft should remain intact."} /></label>
      <p className="study-note">Three persistent child controllers. Two independently resizable seams.</p>
    </> : <><h2>Inspector</h2><label>Inspector note<input defaultValue="Retained inspector draft" /></label><label>Collection<select defaultValue="design"><option value="design">Design studies</option><option>Research</option></select></label>
      <p className="study-caption">DETAILS</p><dl><dt>Type</dt><dd>Note</dd><dt>Modified</dt><dd>Today</dd><dt>Status</dt><dd>Draft</dd></dl>
    </>}
  </div>;
}
function Study() {
  const [controller] = useState(() => {
    let split!: NSESplitViewController;
    class Child extends NSEViewController {
      constructor(readonly role: "sidebar" | "content" | "inspector") { super({ title: role === "sidebar" ? "Library" : role === "content" ? "Document" : "Inspector" }); }
      override renderView() { return <Pane role={this.role} controller={split} />; }
    }
    split = new NSESplitViewController({ id: "split-layout-study", title: "Split view study", splitViewItems: [
      new NSESplitViewItem({ identifier: "sidebar", viewController: new Child("sidebar"), behavior: "sidebar", minimumThickness: 180, maximumThickness: 300, preferredThicknessFraction: 0.22 }),
      new NSESplitViewItem({ identifier: "content", viewController: new Child("content"), minimumThickness: 320 }),
      new NSESplitViewItem({ identifier: "inspector", viewController: new Child("inspector"), behavior: "inspector", minimumThickness: 210, maximumThickness: 320, preferredThicknessFraction: 0.25 }),
    ] });
    return split;
  });
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useLayoutEffect(() => {
    const resize = () => controller[nseUpdateTraits]({ reducedMotion: frames.reducedMotion,
      presentation: createStaticPresentationTraits({ width: innerWidth, height: innerHeight, reducedMotion: frames.reducedMotion }) });
    resize(); window.addEventListener("resize", resize); const release = frames.subscribeState?.(resize);
    return () => { window.removeEventListener("resize", resize); release?.(); };
  }, [controller]);
  useEffect(() => { Object.assign(window, { splitLayoutStudy: { controller, lifetime } }); return () => controller.dispose(); }, [controller]);
  return <main className="study-shell" data-study-material={material}>
    <header className="study-controls"><strong>Split view study</strong><span>{scheme} · {material}</span>
      <button onClick={() => controller.toggleSidebar()}>Toggle sidebar</button>
      <button onClick={() => { if (snapshot.presentation === "single-pane") controller.compactItem = controller.splitViewItems[2]!; else controller.toggleInspector(); }}>Toggle inspector</button>
    </header>
    <section className="study-window">
      <WindowTitlebarView document={{ title: "Design notes", subtitle: "Split layout fixture", documentEdited: false, toolbarStyle: "unified", hasToolbar: false }} isKeyWindow material={material} />
      <div className="study-content"><ViewControllerView controller={controller} /></div>
    </section>
    <footer>Split layout and collapse evidence only. Window lifecycle and titlebar acceptance are separate.</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme} chrome={material === "metal" ? "metal" : "standard"}>
  <AnimationEnvironmentProvider frames={frames}><Study /></AnimationEnvironmentProvider>
</NSEAppearanceProvider>);
