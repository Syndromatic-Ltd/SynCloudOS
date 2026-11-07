/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { NSESearchField } from "../Controls/Fields/NSESearchField";
import { createMediaPanelService, takeOpenPanelMediaSelection } from "../../SynCloudOS/MediaPanels/MediaPanelService";
import { matchesOpenPanelContentType, type FilePanelDirectory, type OpenPanelFolder } from "../../SynCloudOS/FilePanels/OpenPanelFileSystem";
import { referenceForOpenPanelHandle } from "../../SynCloudOS/FilePanels/FileSystemAccessPanelAdapter";
import type { MediaPanelItem } from "../../SynCloudOS/MediaPanels/mediaPanelTypes";
import type { OpenPanelSession } from "./NSEOpenPanel";
import { NSEOpenPanelSources, type OpenPanelSource } from "./NSEOpenPanelSources";
import { NSEOpenPanelCollection, type OpenPanelItem } from "./NSEOpenPanelCollection";

interface Location { readonly source: string; readonly title: string; readonly path: readonly FilePanelDirectory[] }
export function NSEOpenPanelContent({ session }: { readonly session: OpenPanelSession }) {
  const { host, compact } = session;
  const fs = host.fileSystem;
  const [folders, setFolders] = useState<readonly OpenPanelFolder[]>([]);
  const [history, setHistory] = useState<readonly Location[]>(session.directoryURL ? [{ source: "initial", title: session.directoryURL.name, path: [session.directoryURL] }] : []);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showsSources, setShowsSources] = useState(compact);
  const location = history[historyIndex];
  const directory = location?.path.at(-1);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<readonly OpenPanelItem[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const collection = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: compact ? 362 : 578, height: compact ? 560 : 418 });
  const media = useMemo(() => createMediaPanelService(session.mediaSources), [session]);
  const active = useRef<AbortController | null>(null);
  const caps = fs?.capabilities();
  const selectedItems = items.filter(item => selected.has(item.id));
  const chosen = selectedItems.filter(item => item.kind === "directory" ? session.canChooseDirectories : session.canChooseFiles);
  const canOpen = !busy && (chosen.length > 0 || (!!directory && session.canChooseDirectories && !selectedItems.length));
  const title = directory?.name ?? location?.title ?? "Open";
  const fail = useCallback((error: unknown) => { if (!session.signal.aborted) setStatus(error instanceof Error ? error.message : "This source could not be opened."); }, [session]);

  const navigate = useCallback((next: Location) => {
    active.current?.abort();
    setSearch(""); setSelected(new Set()); setItems([]); setStatus(""); setCursor(null); setShowsSources(false);
    setHistory(current => [...current.slice(0, historyIndex + 1), next]);
    setHistoryIndex(current => history.length ? current + 1 : 0);
  }, [history.length, historyIndex]);

  useEffect(() => {
    if (!fs) return;
    let current = true;
    void fs.folders().then(result => { if (current) setFolders(result); }).catch(fail);
    return () => { current = false; };
  }, [fail, fs]);
  useEffect(() => () => { active.current?.abort(); media.dispose(); }, [media]);
  useEffect(() => {
    const element = collection.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) }); };
    measure();
    return host.observeGeometry?.(element, measure);
  }, [host, showsSources]);

  const loadMedia = useCallback(async (providerId: string, nextCursor: string | null, userInitiated: boolean) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const signal = AbortSignal.any([controller.signal, session.signal]);
    setBusy(true); setStatus("");
    const result = await media.query({ id: session.id, providerId, search, kinds: ["image", "video", "audio"], cursor: nextCursor, pageSize: 60, ...(userInitiated ? { userInitiated: true } : {}) }, signal);
    if (signal.aborted) return;
    setBusy(false);
    if (result.kind === "accepted") {
      const accepted = result.items.filter(item => matchesOpenPanelContentType(item.name, item.mimeType, session.allowedContentTypes));
      const mapped = accepted.map(item => ({ id: `${item.providerId}:${item.id}`, name: item.name, kind: "media" as const, media: item }));
      setItems(current => nextCursor ? [...current, ...mapped.filter(item => !current.some(existing => existing.id === item.id))] : mapped);
      setCursor(result.nextCursor);
    } else { setItems([]); setCursor(null); if (result.kind !== "empty") setStatus(result.message); }
  }, [media, search, session]);

  useEffect(() => {
    setSelected(new Set());
    if (!location) return;
    if (directory && fs) {
      active.current?.abort(); const controller = new AbortController(); active.current = controller;
      const signal = AbortSignal.any([controller.signal, session.signal]);
      setBusy(true); setStatus("");
      void fs.entries(directory, session.allowedContentTypes, search, signal).then(handles => {
        if (!signal.aborted) setItems(handles.map(handle => ({ id: `${handle.kind}:${handle.name}`, name: handle.name, kind: handle.kind, handle })));
      }).catch(error => { if (!signal.aborted) fail(error); }).finally(() => { if (!signal.aborted) setBusy(false); });
      return () => controller.abort();
    }
    const provider = session.mediaSources.find(source => `media:${source.id}` === location.source);
    if (provider && !provider.requiresUserActivation) void loadMedia(provider.id, null, false);
  }, [directory, fail, fs, loadMedia, location, search, session]);

  const chooseSource = useCallback(async (id: string) => {
    try {
      if (id === "add-folder") {
        const folder = await fs?.addFolder();
        if (!folder || session.signal.aborted) return;
        setFolders(await fs!.folders());
        if (folder.permission === "granted") navigate({ source: folder.id, title: folder.name, path: [folder.handle] });
        else setStatus("Choose this folder to grant access.");
        return;
      }
      if (id === "app-storage") {
        const root = await fs?.applicationSupportDirectory();
        if (root && !session.signal.aborted) navigate({ source: id, title: "Application Support", path: [root] });
        return;
      }
      const folder = folders.find(folder => folder.id === id);
      if (folder) {
        // Renewal is dispatched by this action, with no queryPermission await before it.
        if (folder.permission !== "granted") {
          const permission = await fs!.unlock(folder.handle);
          if (session.signal.aborted) return;
          setFolders(current => current.map(item => item.id === id ? { ...item, permission } : item));
          if (permission !== "granted") { setStatus("Access to this folder was not granted. Choose it to try again."); return; }
        }
        navigate({ source: id, title: folder.name, path: [folder.handle] }); return;
      }
      const provider = session.mediaSources.find(source => `media:${source.id}` === id);
      if (provider) { navigate({ source: id, title: provider.label, path: [] }); if (provider.requiresUserActivation) void loadMedia(provider.id, null, true); }
    } catch (error) { fail(error); }
  }, [fail, folders, fs, loadMedia, navigate, session]);

  const groups = useMemo<readonly OpenPanelSource[]>(() => [
    ...(caps?.folders ? [{ id: "folders", name: "Folders", children: [...folders.map(folder => ({ id: folder.id, name: folder.name, locked: folder.permission !== "granted" })), { id: "add-folder", name: "Add Folder…" }] }] : []),
    ...(session.mediaSources.length ? [{ id: "media", name: "Media", children: session.mediaSources.map(source => ({ id: `media:${source.id}`, name: source.label })) }] : []),
    ...(caps?.applicationStorage ? [{ id: "storage", name: "App Storage", children: [{ id: "app-storage", name: "Application Support" }] }] : []),
  ], [caps?.applicationStorage, caps?.folders, folders, session.mediaSources]);

  const openItems = useCallback(async (selectedItems: readonly OpenPanelItem[]) => {
    try {
      const selectedMedia = selectedItems.flatMap(item => item.media ? [item.media] : []);
      const handles = selectedItems.flatMap(item => item.handle ? [item.handle] : []);
      if (!selectedMedia.length && !handles.length && directory && session.canChooseDirectories) handles.push(directory);
      const refs = await Promise.all(handles.map((handle, index) => referenceForOpenPanelHandle(handle, session.id, index, host.hasTransientUserActivation)));
      if (session.signal.aborted) { refs.forEach(ref => ref.release("request-replaced")); return; }
      await session.accept([...refs, ...selectedMedia], takeOpenPanelMediaSelection(media, selectedMedia));
    } catch (error) { fail(error); }
  }, [directory, fail, host.hasTransientUserActivation, media, session]);
  const activate = (item: OpenPanelItem) => {
    if (item.kind === "directory" && item.handle?.kind === "directory") navigate({ source: location!.source, title: location!.title, path: [...location!.path, item.handle] });
    else if (session.canChooseFiles) void openItems([item]);
  };
  const system = () => {
    setStatus("");
    void session.systemChooser().then(result => {
      if (session.signal.aborted) return;
      if (result.kind === "accepted") void session.accept(result.values);
      else if (result.kind !== "cancelled") setStatus("message" in result ? result.message : "Choose another file.");
    }).catch(fail);
  };
  const stepHistory = (delta: number) => { active.current?.abort(); setSearch(""); setItems([]); setSelected(new Set()); setStatus(""); setHistoryIndex(current => current + delta); };
  const summary = chosen.length ? `${chosen.length} ${chosen.length === 1 ? "item" : "items"} selected${chosen.length === 1 ? ` — ${chosen[0]!.name}` : ""}` : directory && session.canChooseDirectories ? "Open this folder, or choose an item." : "Choose an item to open.";
  const sourcePage = <nav aria-label="Open panel sources" className="nse-open-sources">
    <NSEOpenPanelSources id={`${session.id}:sources`} groups={groups} selectedId={location?.source ?? null} onSelect={id => { void chooseSource(id); }} />
    <NSEButton title="System Chooser…" className="nse-open-system" onClick={system} />
  </nav>;
  const openButton = <NSEButton title={session.prompt || "Open"} keyEquivalent={"\r"} isEnabled={canOpen} onClick={() => void openItems(chosen)} />;
  return <section className="nse-open-panel" data-nse-control="open-panel" data-compact={compact || undefined} data-page={compact && showsSources ? "sources" : "collection"} aria-label={session.prompt || "Open"}>
    {compact ? <header className="nse-open-phone-header">
      {showsSources ? <NSEButton title="Cancel" onClick={session.cancel} /> : <NSEButton title="‹ Sources" aria-label="Sources" onClick={() => setShowsSources(true)} />}
      <strong>{showsSources ? "Sources" : title}</strong>{showsSources ? <span className="nse-open-header-spacer" /> : openButton}
    </header> : null}
    <div className="nse-open-body">
      {!compact || showsSources ? sourcePage : null}
      {!compact || !showsSources ? <main className="nse-open-main">
        {session.message ? <p className="nse-open-message">{session.message}</p> : null}
        <div className="nse-open-toolbar">
          {location?.path.length ? <><div className="nse-open-history"><NSEButton title="‹" aria-label="Back" isEnabled={historyIndex > 0} onClick={() => stepHistory(-1)} /><NSEButton title="›" aria-label="Forward" isEnabled={historyIndex < history.length - 1} onClick={() => stepHistory(1)} /></div>
          <nav aria-label="Path" className="nse-open-path">{location.path.map((part, index) => <React.Fragment key={index}>{index ? <span aria-hidden="true">›</span> : null}<button type="button" onClick={() => navigate({ ...location, path: location.path.slice(0, index + 1) })}>{index === 0 ? location.title : part.name}</button></React.Fragment>)}</nav></> : <strong className="nse-open-location-title">{location?.title ?? "Choose a source"}</strong>}
          <NSESearchField aria-label={`Search ${title}`} placeholder={`Search ${title}`} className="nse-open-search" value={search} onValueChange={setSearch} showsSearchIcon height={compact ? 36 : 28} />
        </div>
        <div className="nse-open-results" ref={collection}>
          {busy ? <p role="status">Loading…</p> : null}
          {status ? <p role="status" className="nse-open-status">{status}</p> : null}
          {!busy && !status && !items.length ? <p className="nse-open-empty">{location ? "No matching items." : "Choose a source, add a folder, or use the system chooser."}</p> : null}
          {items.length ? <NSEOpenPanelCollection items={items} selectedIds={selected} multiple={session.allowsMultipleSelection} compact={compact} width={size.width} height={size.height} title={title}
            onSelect={ids => { setSelected(ids); if (compact) { const item = items.find(item => ids.has(item.id)); if (item?.kind === "directory") activate(item); } }} onActivate={activate} /> : null}
        </div>
        {cursor ? <NSEButton title="Load more" isEnabled={!busy} onClick={() => void loadMedia(location!.source.slice(6), cursor, false)} /> : null}
        <footer className="nse-open-footer"><span role="status">{summary}</span>{!compact ? <><span className="nse-open-footer-spacer"/><NSEButton title="Cancel" onClick={session.cancel} />{openButton}</> : <NSEButton title="Cancel" onClick={session.cancel} />}</footer>
      </main> : null}
    </div>
    {compact && showsSources && status ? <p role="status" className="nse-open-status">{status}</p> : null}
  </section>;
}
