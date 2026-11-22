/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { inside, projectContext, slash } from "./project.mjs";
import { retiredWebspringNames } from "../synware/validation-core.mjs";
export function similarity(query, candidate) {
  const a = query.toLowerCase(), b = candidate.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a)) return 0.9;
  const row = Array.from({length:b.length+1},(_,i) => i);
  for (let i=1;i<=a.length;i++) {
    let previous = row[0]; row[0]=i;
    for (let j=1;j<=b.length;j++) { const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1)); previous=old; }
  }
  return 1-row[b.length]/Math.max(a.length,b.length,1);
}
function applicationMenuQuery(query) {
  return /^(?:application[\s_-]*menu|(?:system\s+)?preferences|settings|account)$/iu.test(query?.trim() ?? "");
}

/**
 * Plain-English descriptions and AppKit variant names mapped to public NSE APIs,
 * exact prop usage, and Control Gallery example names so agents find existing
 * controls before inventing one.
 */
const CONTROL_CONCEPTS = Object.freeze([
  {
    aliases: ["circular slider", "angle dial", "rotation dial", "shadow angle dial", "knob", "dial", "rotary slider", "rotary knob", "wrapping angle dial", "nsslider.slidertype.circular", "slidertype.circular", "nsecircularslider"],
    symbols: ["NSESlider", "NSESliderProps"],
    usage: 'NSESlider sliderType="circular"',
    galleryExample: "Wrapping angle dial",
    appkitCounterpart: "NSSlider.SliderType.circular",
    docKeywords: ["sliderType", "circular", "NSESlider", "dial"],
  },
  {
    aliases: ["linear slider", "range slider", "slider", "scrubber", "nsslider", "nsslider.slidertype.linear"],
    symbols: ["NSESlider", "NSESliderProps"],
    usage: 'NSESlider sliderType="linear"',
    galleryExample: "Linear slider",
    appkitCounterpart: "NSSlider",
    docKeywords: ["NSESlider", "slider"],
  },
  {
    aliases: ["toggle switch", "switch", "on off switch", "nsswitch"],
    symbols: ["NSESwitch", "NSEButton"],
    usage: "NSESwitch",
    galleryExample: "Switch",
    appkitCounterpart: "NSSwitch",
    docKeywords: ["NSESwitch", "switch"],
  },
  {
    aliases: ["checkbox", "check box", "tick box", "nsbutton.buttontype.switch"],
    symbols: ["NSEButton"],
    usage: 'NSEButton buttonType="switch"',
    galleryExample: "Checkbox",
    appkitCounterpart: "NSButton.ButtonType.switch",
    docKeywords: ["NSEButton", "switch"],
  },
  {
    aliases: ["disclosure triangle", "disclosure button", "expand collapse", "accordion", "nsbutton.bezelstyle.disclosure"],
    symbols: ["NSEButton"],
    usage: 'NSEButton bezelStyle="disclosure" buttonType="pushOnPushOff"',
    galleryExample: "Disclosure triangle",
    appkitCounterpart: "NSButton.BezelStyle.disclosure",
    docKeywords: ["NSEButton", "disclosure"],
  },
  {
    aliases: ["segmented control", "capsule tabs", "tool button group", "grouped buttons", "button group", "nssegmentedcontrol"],
    symbols: ["NSESegmentedControl", "NSEToolbarItemGroup"],
    usage: 'NSESegmentedControl segmentStyle="capsule" | "texturedRounded"',
    galleryExample: "Segmented control",
    appkitCounterpart: "NSSegmentedControl",
    docKeywords: ["NSESegmentedControl", "segmented"],
  },
  {
    aliases: ["dropdown", "drop down", "select", "popup button", "pop-up button", "pull-down", "pulldown", "nspopupbutton"],
    symbols: ["NSEPopUpButton"],
    usage: "NSEPopUpButton",
    galleryExample: "Pop-up button",
    appkitCounterpart: "NSPopUpButton",
    docKeywords: ["NSEPopUpButton", "pop-up"],
  },
  {
    aliases: ["combo box", "combobox", "autocomplete", "editable dropdown", "nscombobox"],
    symbols: ["NSEComboBox"],
    usage: "NSEComboBox",
    galleryExample: "Combo box",
    appkitCounterpart: "NSComboBox",
    docKeywords: ["NSEComboBox", "combo"],
  },
  {
    aliases: ["token field", "tag input", "chips", "pills input", "nstokenfield"],
    symbols: ["NSETokenField"],
    usage: "NSETokenField",
    galleryExample: "Token field",
    appkitCounterpart: "NSTokenField",
    docKeywords: ["NSETokenField", "token"],
  },
  {
    aliases: ["stepper", "number stepper", "spinbutton", "increment decrement", "nsstepper"],
    symbols: ["NSEStepper"],
    usage: "NSEStepper",
    galleryExample: "Stepper",
    appkitCounterpart: "NSStepper",
    docKeywords: ["NSEStepper", "stepper"],
  },
  {
    aliases: ["progress bar", "progress indicator", "spinner", "loading spinner", "activity indicator", "nsprogressindicator"],
    symbols: ["NSEProgressIndicator"],
    usage: 'NSEProgressIndicator style="bar" | "spinning"',
    galleryExample: "Progress indicator",
    appkitCounterpart: "NSProgressIndicator",
    docKeywords: ["NSEProgressIndicator", "progress"],
  },
  {
    aliases: ["level indicator", "level meter", "rating", "star rating", "capacity bar", "meter", "nslevelindicator"],
    symbols: ["NSELevelIndicator"],
    usage: "NSELevelIndicator",
    galleryExample: "Level indicator",
    appkitCounterpart: "NSLevelIndicator",
    docKeywords: ["NSELevelIndicator", "level"],
  },
  {
    aliases: ["colour well", "color well", "colour picker", "color picker", "colour swatch", "color swatch", "nscolorwell", "nscolorpanel"],
    symbols: ["NSEColourWell", "NSEColourPanel"],
    usage: "NSEColourWell",
    galleryExample: "Colour well",
    appkitCounterpart: "NSColorWell",
    docKeywords: ["NSEColourWell", "colour"],
  },
  {
    aliases: ["date picker", "calendar", "clock", "time picker", "date range", "nsdatepicker"],
    symbols: ["NSEDatePicker"],
    usage: "NSEDatePicker",
    galleryExample: "Date picker",
    appkitCounterpart: "NSDatePicker",
    docKeywords: ["NSEDatePicker", "date"],
  },
  {
    aliases: ["search field", "search bar", "search input", "search box", "nssearchfield"],
    symbols: ["NSESearchField"],
    usage: "NSESearchField",
    galleryExample: "Search field",
    appkitCounterpart: "NSSearchField",
    docKeywords: ["NSESearchField", "search"],
  },
  {
    aliases: ["password field", "password input", "secure field", "secure text", "nssecuretextfield"],
    symbols: ["NSESecureTextField"],
    usage: "NSESecureTextField",
    galleryExample: "Secure text field",
    appkitCounterpart: "NSSecureTextField",
    docKeywords: ["NSESecureTextField", "secure"],
  },
  {
    aliases: ["label", "static text", "embossed status label", "text field", "nstextfield"],
    symbols: ["NSETextField"],
    usage: 'NSETextField isEditable={false} font="footnote" backgroundStyle="raised"',
    galleryExample: "Text field",
    appkitCounterpart: "NSTextField",
    docKeywords: ["NSETextField", "text-field"],
  },
  {
    aliases: ["rich text editor", "text editor", "multiline text", "text view", "nstextview"],
    symbols: ["NSETextView"],
    usage: "NSETextView",
    galleryExample: "Text view",
    appkitCounterpart: "NSTextView",
    docKeywords: ["NSETextView", "text"],
  },
  {
    aliases: ["sidebar", "source list", "tree view", "outline view", "nsoutlineview"],
    symbols: ["NSEOutlineView"],
    usage: 'NSEOutlineView selectionHighlightStyle="sourceList"',
    galleryExample: "Outline view",
    appkitCounterpart: "NSOutlineView",
    docKeywords: ["NSEOutlineView", "source-list"],
  },
  {
    aliases: ["split view", "three pane", "three-pane", "inspector pane", "collapsible sidebar", "nssplitviewcontroller", "nssplitviewitem"],
    symbols: ["NSESplitViewController", "NSESplitViewItem"],
    usage: "NSESplitViewController with NSESplitViewItem",
    appkitCounterpart: "NSSplitViewController",
    docKeywords: ["NSESplitViewController", "split"],
  },
  {
    aliases: ["collection view", "grid view", "cover flow", "nscollectionview"],
    symbols: ["NSECollectionView"],
    usage: "NSECollectionView",
    galleryExample: "Collection view",
    appkitCounterpart: "NSCollectionView",
    docKeywords: ["NSECollectionView", "collection"],
  },
  {
    aliases: ["column browser", "miller columns", "nsbrowser"],
    symbols: ["NSEBrowser"],
    usage: "NSEBrowser",
    galleryExample: "Browser",
    appkitCounterpart: "NSBrowser",
    docKeywords: ["NSEBrowser", "browser"],
  },
  {
    aliases: ["data table", "table view", "sortable table", "nstableview"],
    symbols: ["NSETableView"],
    usage: "NSETableView",
    galleryExample: "Table view",
    appkitCounterpart: "NSTableView",
    docKeywords: ["NSETableView", "table"],
  },
  {
    aliases: ["tabs", "tab bar", "tab view", "nstabview", "nstabviewcontroller"],
    symbols: ["NSETabView", "NSETabViewController"],
    usage: "NSETabView",
    galleryExample: "Tab view",
    appkitCounterpart: "NSTabView",
    docKeywords: ["NSETabView", "tab"],
  },
  {
    aliases: ["scroll view", "rubber band", "rubber-band scrolling", "scroller", "nsscrollview"],
    symbols: ["NSEScrollView"],
    usage: "NSEScrollView",
    appkitCounterpart: "NSScrollView",
    docKeywords: ["NSEScrollView", "scroll"],
  },
  {
    aliases: ["breadcrumb", "path bar", "path control", "nspathcontrol"],
    symbols: ["NSEPathControl"],
    usage: "NSEPathControl",
    galleryExample: "Path control",
    appkitCounterpart: "NSPathControl",
    docKeywords: ["NSEPathControl", "path"],
  },
  {
    aliases: ["rule editor", "predicate editor", "filter builder", "query builder", "nsruleeditor", "nspredicateeditor"],
    symbols: ["NSERuleEditor", "NSEPredicateEditor"],
    usage: "NSERuleEditor / NSEPredicateEditor",
    galleryExample: "Rule editor",
    appkitCounterpart: "NSRuleEditor",
    docKeywords: ["NSERuleEditor", "predicate"],
  },
  {
    aliases: ["page curl", "book reader", "page controller", "nspagecontroller"],
    symbols: ["NSEPageController"],
    usage: "NSEPageController",
    appkitCounterpart: "NSPageController",
    docKeywords: ["NSEPageController", "page"],
  },
  {
    aliases: ["popover", "sheet", "modal window", "nspopover", "presentaspopover", "presentassheet"],
    symbols: ["NSEViewController", "NSEWindowController"],
    usage: "viewController.presentAsPopover(Controller, { of: anchor }) / presentAsSheet(Controller)",
    appkitCounterpart: "NSPopover",
    docKeywords: ["presentAsPopover", "popover", "sheet"],
  },
  {
    aliases: ["alert", "confirmation dialog", "confirm sheet", "nsalert"],
    symbols: ["NSEAlert", "NSEModalResponse"],
    usage: "new NSEAlert().beginSheetModal(window)",
    appkitCounterpart: "NSAlert",
    docKeywords: ["NSEAlert", "alert"],
  },
  {
    aliases: ["open panel", "save panel", "file picker", "file dialog", "nsopenpanel", "nssavepanel"],
    symbols: ["NSEOpenPanel", "NSESavePanel"],
    usage: "SCOS.filePanels / NSEOpenPanel / NSESavePanel",
    appkitCounterpart: "NSOpenPanel",
    docKeywords: ["NSEOpenPanel", "NSESavePanel", "file"],
  },
  {
    aliases: ["status bar", "bottom bar", "content border", "setcontentborderthickness", "window footer"],
    symbols: ["NSEWindowController", "NSETextField"],
    usage: 'window.setContentBorderThickness(thickness, "minY") with NSETextField isEditable={false} backgroundStyle="raised"',
    appkitCounterpart: "NSWindow.setContentBorderThickness(_:for:)",
    docKeywords: ["contentBorder", "status", "window"],
  },
  {
    aliases: ["titlebar", "title bar", "toolbar", "window chrome", "stylemask", "nswindow", "nstoolbar", "nswindowcontroller"],
    symbols: ["NSEWindowController", "NSEToolbar", "NSEToolbarItem"],
    usage: "NSEWindowController with window.toolbar = new NSEToolbar(...)",
    appkitCounterpart: "NSWindowController",
    docKeywords: ["NSEWindowController", "toolbar", "titlebar"],
  },
  {
    aliases: ["application menu", "menu bar", "mainmenu", "settings", "preferences", "account", "nsapplication.mainmenu", "nsmenu"],
    symbols: ["NSEToolbarItem", "NSEApplication", "NSEMenuBar", "NSEMenu", "useApplicationMenuTrigger"],
    usage: 'NSEApplication.mainMenu, NSEToolbarItem.applicationMenu("gear"), or useApplicationMenuTrigger()',
    appkitCounterpart: "NSApplication.mainMenu",
    docKeywords: ["NSEToolbarItem.applicationMenu", "mainMenu", "preferences"],
  },
  {
    aliases: ["quickswitch", "quick switch", "document switcher", "window title menu"],
    symbols: ["useQuickSwitchTrigger"],
    usage: "useQuickSwitchTrigger()",
    docKeywords: ["useQuickSwitchTrigger", "QuickSwitch"],
  },
  {
    aliases: ["font panel", "typeface picker", "font picker", "nsfontpanel"],
    symbols: ["NSEFontPanel"],
    usage: "NSEFontPanel",
    appkitCounterpart: "NSFontPanel",
    docKeywords: ["NSEFontPanel", "font"],
  },
  {
    aliases: ["group box", "card", "box", "separator", "nsbox"],
    symbols: ["NSEBox"],
    usage: "NSEBox",
    galleryExample: "Box",
    appkitCounterpart: "NSBox",
    docKeywords: ["NSEBox", "box"],
  },
  {
    aliases: ["system image", "template icon", "back arrow", "forward arrow", "nsimage", "nsimageview"],
    symbols: ["NSEImage", "NSEImageView"],
    usage: "NSEImage.named(NSEImage.goBackTemplateName)",
    appkitCounterpart: "NSImage",
    docKeywords: ["NSEImage", "image"],
  },
]);

function normaliseQuery(query) {
  return (query ?? "").trim().toLowerCase().replace(/[\s_-]+/gu, " ");
}

function matchConcepts(query) {
  const norm = normaliseQuery(query);
  if (!norm) return [];
  const compact = norm.replace(/\s+/gu, "");
  const queryWords = new Set(norm.split(/\s+/u).filter(w => w.length >= 2));
  const hits = [];
  for (const concept of CONTROL_CONCEPTS) {
    let best = 0;
    for (const alias of concept.aliases) {
      const aNorm = normaliseQuery(alias);
      const aCompact = aNorm.replace(/\s+/gu, "");
      if (norm === aNorm || compact === aCompact) { best = Math.max(best, 1.9); continue; }
      if (aNorm.includes(norm) && norm.length >= 4) { best = Math.max(best, 1.72); continue; }
      if (norm.includes(aNorm) && aNorm.length >= 4) { best = Math.max(best, 1.68); continue; }
      const aliasWords = aNorm.split(/\s+/u).filter(w => w.length >= 2);
      if (aliasWords.length > 0 && aliasWords.every(word => queryWords.has(word))) best = Math.max(best, 1.65);
    }
    if (best > 0) hits.push({ concept, score: best });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Reverse map from AppKit / Foundation / Core framework names to NSE symbol names. */
function reverseCounterparts(map) {
  const reverse = new Map();
  if (!map) return reverse;
  const add = (nseName, counterpart) => {
    if (typeof counterpart !== "string") return;
    const key = counterpart.toLowerCase();
    const list = reverse.get(key) ?? [];
    if (!list.includes(nseName)) list.push(nseName);
    reverse.set(key, list);
    // Also index the base class before any dot (e.g. "NSWindow" from "NSWindow.StyleMask").
    const base = key.split(".")[0];
    if (base && base !== key) {
      const baseList = reverse.get(base) ?? [];
      if (!baseList.includes(nseName)) baseList.push(nseName);
      reverse.set(base, baseList);
    }
  };
  for (const [nseName, value] of Object.entries(map.counterparts ?? {})) add(nseName, value);
  for (const [nseName, value] of Object.entries(map.frameworkCounterparts ?? {})) add(nseName, value);
  for (const [member, value] of Object.entries(map.members ?? {})) add(member.split(".")[0], value);
  return reverse;
}

function symbolScore(query, name, conceptHits = [], counterpartTargets = new Map()) {
  if (query.toLowerCase() === name.toLowerCase()) return 2;
  if (applicationMenuQuery(query)) {
    const preferred = ["NSEToolbarItem", "NSEApplication", "NSEMenuBar"];
    const index = preferred.indexOf(name);
    if (index !== -1) return 1.5 - index * 0.1;
  }
  let score = similarity(query, name);
  const direct = counterpartTargets.get(name);
  if (direct) score = Math.max(score, direct);
  for (const { concept, score: conceptScore } of conceptHits) {
    const index = concept.symbols.indexOf(name);
    if (index !== -1) score = Math.max(score, conceptScore - index * 0.04);
  }
  return score;
}
const DOC_EXCERPT=1500, SIGNATURE_OUTLINE=1200;
/** The installed SDK's map of NSE names to their AppKit, Foundation or Core framework counterparts. */
export function appkitCounterparts(sdkRoot) {
  const path=resolve(sdkRoot,"docs/framework/appkit-counterparts.json");
  return existsSync(path) ? JSON.parse(readFileSync(path,"utf8")) : null;
}
/**
 * The counterpart of a public NSE name: its own entry, or the entry of the name it extends with one of
 * the map's derived suffixes (NSEButtonProps takes NSEButton's). Undefined when the map has none.
 */
export function appkitCounterpartFor(name, map) {
  if (!map) return undefined;
  if (map.frameworkCounterparts && Object.hasOwn(map.frameworkCounterparts,name)) return map.frameworkCounterparts[name];
  const suffix=new RegExp("(?:"+map.derivedSuffixes.join("|")+")$","u");
  for (let base=name;;) {
    if (Object.hasOwn(map.counterparts,base)) return map.counterparts[base];
    if (!suffix.test(base)) return undefined;
    base=base.replace(suffix,"");
  }
}
/** A long class or interface as its header and member signatures, without bodies or private members. */
function outline(declaration) {
  const text=declaration.getText().replace(/^\s*export\s+/u,"");
  if (text.length<=SIGNATURE_OUTLINE || !(ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))) return {signature:text,outlined:false};
  const source=declaration.getSourceFile(), open=text.indexOf("{");
  const members=[];
  for (const member of declaration.members) {
    if (member.name && (ts.isPrivateIdentifier(member.name) || ts.getCombinedModifierFlags(member) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))) continue;
    const body=member.body;
    const start=member.getStart(source), end=body ? body.getStart(source) : member.getEnd();
    members.push("  "+source.text.slice(start,end).replace(/\s+/gu," ").trim().replace(/[;{]?$/u,";"));
  }
  return {signature:(open===-1 ? text : text.slice(0,open+1))+"\n"+members.join("\n")+"\n}",outlined:true};
}
export function docSections(sdkRoot, query, limit=3) {
  const docsRoot=resolve(sdkRoot,"docs/framework");
  if (!existsSync(docsRoot) || !query) return [];
  const words=query.toLowerCase().match(/[a-z][a-z0-9_]+/gu) ?? [];
  const results=[];
  function scan(directory) {
    for (const file of readdirSync(directory,{withFileTypes:true})) {
      const path=resolve(directory,file.name);
      if (file.isDirectory()) scan(path);
      else if (file.isFile() && file.name.endsWith(".md")) {
        const sections=readFileSync(path,"utf8").split(/(?=^#{1,6} )/mu);
        for (const text of sections) {
          const lower=text.toLowerCase();
          let score=words.filter(word=>lower.includes(word)).length;
          if (applicationMenuQuery(query) && lower.includes("nsetoolbaritem.applicationmenu")) {
            score+=10;
            if (lower.includes("applicationmenu")) score+=2;
            if (lower.includes("preferences")) score+=2;
            if (text.includes("```")) score+=1;
          }
          if (score) results.push({file:slash(relative(sdkRoot,path)),heading:text.split("\n")[0],text:text.slice(0,DOC_EXCERPT),truncated:text.length>DOC_EXCERPT,score});
        }
      }
    }
  }
  scan(docsRoot);
  return results.sort((a,b)=>b.score-a.score).slice(0,limit);
}
export async function lookupSdk({projectRoot,entry,query,limit=8,full=false}={}) {
  const {sdkRoot,sdk}=projectContext(projectRoot);
  const entries=Object.entries(sdk.exports ?? {}).filter(([,target])=>target && typeof target==="object" && target.types).map(([name,target])=>({name:name.replace(/^\.\//u,""),path:resolve(sdkRoot,target.types)}));
  if (!query && !entry) return {version:sdk.version,entries:entries.map(value=>value.name)};
  const selected=entry ? entries.filter(value=>value.name===entry.replace(sdk.name+"/","").replace(/^\.\//u,"")) : entries;
  if (!selected.length) throw new Error("Unknown SDK entry: " + entry);
  for (const value of selected) if (!inside(sdkRoot,value.path)) throw new Error("SDK type export escapes its package.");
  const program=ts.createProgram(selected.map(value=>value.path),{noLib:true,skipLibCheck:true,moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,allowJs:false});
  // One result per declaration: a symbol re-exported by several entries lists every entry once.
  const checker=program.getTypeChecker(),symbols=[],byDeclaration=new Map(),counterparts=appkitCounterparts(sdkRoot);
  // A removed Webspring helper answers with the classes that replace it.
  const retired=query && Object.hasOwn(retiredWebspringNames,query) ? retiredWebspringNames[query] : null;
  const conceptHits=query ? matchConcepts(query) : [];
  const reverseMap=reverseCounterparts(counterparts);
  const counterpartTargets=new Map();
  if (query) {
    const qLower=query.trim().toLowerCase();
    for (const target of reverseMap.get(qLower) ?? []) counterpartTargets.set(target, Math.max(counterpartTargets.get(target) ?? 0, 1.85));
    const qBase=qLower.split(".")[0];
    if (qBase && qBase !== qLower) {
      for (const target of reverseMap.get(qBase) ?? []) counterpartTargets.set(target, Math.max(counterpartTargets.get(target) ?? 0, 1.75));
    }
    if (qLower.length >= 4) {
      for (const [appkitName, targets] of reverseMap.entries()) {
        if (appkitName !== qLower && appkitName.includes(qLower)) {
          for (const target of targets) counterpartTargets.set(target, Math.max(counterpartTargets.get(target) ?? 0, 1.45));
        }
      }
    }
  }
  const queries=[query,...(retired?.replacements ?? [])].filter(Boolean);
  for (const value of selected) {
    const source=program.getSourceFile(value.path),module=source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      const name=exported.getName(),score=query ? Math.max(...queries.map(candidate=>symbolScore(candidate,name,conceptHits,counterpartTargets))) : 1;
      if (score<0.55) continue;
      const symbol=exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations=symbol.getDeclarations() ?? [];
      const key=declarations.map(declaration=>declaration.getSourceFile().fileName+":"+declaration.pos).join("|")+"|"+name;
      const existing=byDeclaration.get(key);
      if (existing) { existing.entries.push(value.name); continue; }
      const shapes=declarations.map(declaration=>full ? {signature:declaration.getText().replace(/^\s*export\s+/u,""),outlined:false} : outline(declaration));
      const signature=shapes.map(shape=>shape.signature).join("\n");
      const jsDoc=ts.displayPartsToString(symbol.getDocumentationComment(checker));
      const tags=symbol.getJsDocTags(checker).map(tag=>"@"+tag.name+" "+ts.displayPartsToString(tag.text));
      const first=declarations[0];
      const record={entry:value.name,entries:[value.name],name,signature,outlined:shapes.some(shape=>shape.outlined),jsDoc:[jsDoc,...tags].filter(Boolean).join("\n"),file:first ? slash(relative(sdkRoot,first.getSourceFile().fileName)) : null,line:first ? first.getSourceFile().getLineAndCharacterOfPosition(first.getStart()).line+1 : null,score};
      // NSE names are AppKit names: say which, or why there is none.
      const counterpart=appkitCounterpartFor(name,counterparts);
      if (counterpart!==undefined) record.appkitCounterpart=counterpart;
      const matchedConcept=conceptHits.find(hit=>hit.concept.symbols.includes(name))?.concept;
      if (matchedConcept) {
        if (matchedConcept.usage) record.usage=matchedConcept.usage;
        if (matchedConcept.galleryExample) record.galleryExample=matchedConcept.galleryExample;
        if (!record.appkitCounterpart && matchedConcept.appkitCounterpart) record.appkitCounterpart=matchedConcept.appkitCounterpart;
      }
      byDeclaration.set(key,record); symbols.push(record);
    }
  }
  // Report each symbol under one entry: sdk first, then the root, nse and the rest.
  const rank=name=>name==="sdk" ? 0 : name==="." ? 1 : name==="nse" ? 2 : 3;
  for (const record of symbols) { record.entries.sort((a,b)=>rank(a)-rank(b) || a.localeCompare(b)); record.entry=record.entries[0]; }
  const matches=symbols.sort((a,b)=>b.score-a.score || rank(a.entry)-rank(b.entry) || a.name.localeCompare(b.name)).slice(0,limit);
  const topConcept=conceptHits[0]?.concept;
  const docQuery=applicationMenuQuery(query)
    ? query
    : topConcept?.docKeywords?.join(" ") ?? matches[0]?.name ?? query ?? entry;
  return {
    version:sdk.version,
    symbols:matches,
    ...(retired ? {retired:{name:query,replacements:retired.replacements,message:retired.message}} : {}),
    ...(topConcept ? {concept:{usage:topConcept.usage,symbols:topConcept.symbols,...(topConcept.galleryExample ? {galleryExample:topConcept.galleryExample} : {}),...(topConcept.appkitCounterpart ? {appkitCounterpart:topConcept.appkitCounterpart} : {})}} : {}),
    docs:docSections(sdkRoot,docQuery),
  };
}
