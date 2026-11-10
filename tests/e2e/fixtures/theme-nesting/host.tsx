import { createRoot } from 'react-dom/client';
import { useLayoutEffect, useRef, useState } from 'react';
import { themes } from 'virtual:syncloudos/themes';
import { NSEAppearanceProvider } from '../../../../src/NSE/Appearance/NSEAppearanceProvider';
import { NSEAppearance } from '../../../../src/NSE/Appearance/NSEAppearance';
import { NSEView } from '../../../../src/NSE/Views/NSEView';
import { NSEButton } from '../../../../src/NSE/Controls/Buttons/NSEButton';
import { NSEImage } from '../../../../src/NSE/Controls/Images/NSEImageResource';
import { LoginWindow } from '../../../../src/NSE/SystemUI/LoginWindow';
import { atmoTheme } from '../../../../src/NSE/Themes/Atmo';
import { freezeNSETheme } from '../../../../src/NSE/Theme/NSETheme';
import { NSEStandaloneControlHost } from '../../../../src/NSE/Overlays';
import { NSEViewController, nseUpdateTraits } from '../../../../src/NSE/Application/NSEViewController';
import { NSEViewControllerView } from '../../../../src/SynCloudOS/AppHosting/applicationHosting';
import { NSETabViewController, NSETabViewItem } from '../../../../src/NSE/Navigation/NSETabViewController';
import { NSEScrollView } from '../../../../src/NSE/Scroll/NSEScrollView';
import { NSEWindowLayoutContext, NSEWindowLayoutModel } from '../../../../src/NSE/Layout/windowChromeObstructions';
import { createStaticPresentationPort, createStaticPresentationTraits } from '../../../fixtures/presentationTraits';
import '../../../../src/NSE/public/styles.css';
const parameters = new URLSearchParams(location.search);
const widthClass = parameters.get('width') === 'regular' ? 'regular' : 'compact';
const width = widthClass === 'regular' ? 1000 : 390;
const height = 844;
const presentation = createStaticPresentationPort({ width, height, reducedMotion: true });
class DocumentPage extends NSEViewController {
  static override view = () => <NSEScrollView rubberBand={false}><div data-first-row style={{height:40}}>First row</div><div style={{height:1200}}>Document</div><div data-last-row style={{height:40}}>Last row</div></NSEScrollView>;
}
function Navigation() {
  const root = useRef<HTMLDivElement>(null);
  const [model] = useState(() => new NSEWindowLayoutModel({bounds:{x:0,y:0,width,height}}));
  const [tabs] = useState(() => {
    const tabs = new NSETabViewController(); tabs.tabStyle='sidebarAdaptable';
    tabs[nseUpdateTraits]({reducedMotion:true,presentation:createStaticPresentationTraits({width,height})});
    for(const id of ['first','second']) tabs.addTabViewItem(new NSETabViewItem({identifier:id,viewController:tabs.addChild(DocumentPage,{title:id})}));
    return tabs;
  });
  const placement = parameters.get('placement')!;
  const flow = parameters.get('flow') as 'in-flow' | 'overlay';
  const theme=freezeNSETheme({...atmoTheme,bundleIdentifier:'com.example.navigation',navigation:{...atmoTheme.navigation,[widthClass]:{placement,flow}}} as typeof atmoTheme);
  useLayoutEffect(()=> { const stop=model.connectRoot(root.current!); return ()=>{stop();model.dispose();tabs.dispose();}; },[model,tabs]);
  return <NSEAppearanceProvider theme={theme}><div ref={root} dir={parameters.get('dir') ?? 'ltr'} style={{position:'relative',width,height}}><NSEWindowLayoutContext.Provider value={model}><NSEViewControllerView controller={tabs}/></NSEWindowLayoutContext.Provider></div></NSEAppearanceProvider>;
}
function Contents() {
  if(parameters.has('placement')) return <Navigation/>;
  if(parameters.has('login')) return <NSEAppearanceProvider theme={themes['com.example.inner']}><LoginWindow title="SynCloudOS" methods={[{id:'example',label:'Continue'}]}/></NSEAppearanceProvider>;
  return <NSEAppearanceProvider theme={themes['com.example.outer']} colourScheme="light"><div id="outer"><NSEButton id="outer-button">Outer</NSEButton></div><NSEView id="inner" appearance={new NSEAppearance('aqua',{theme:themes['com.example.inner']})}><NSEButton id="inner-button" image={NSEImage.named(NSEImage.goBackTemplateName)}>Inner</NSEButton></NSEView><NSEView appearance={new NSEAppearance('aqua',{theme:themes['com.example.partial']})}><NSEButton id="partial-button">Partial</NSEButton></NSEView><NSEView appearance={new NSEAppearance('aqua',{theme:atmoTheme})}><NSEButton id="atmo-button">Atmo</NSEButton></NSEView></NSEAppearanceProvider>;
}
document.body.style.margin='0';
createRoot(document.getElementById('root')!).render(<NSEStandaloneControlHost document={document} window={window} presentation={presentation}><Contents/></NSEStandaloneControlHost>);
