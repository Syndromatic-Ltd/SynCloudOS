import { useCallback, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { useObserve } from "../Objects/useObserve";
import type { NSEPageController } from "./NSEPageController";
import { pageCurlConnection } from "./pageCurlConnection";
import { NSEUntransitionedChildView } from "../Application/viewControllerRenderer";
import { NSEPageCurlLeaf } from "./NSEPageCurlLeaf";
import type { NSEPageCorner, NSEPageHandle } from "./nsePageTypes";
import "./pageCurlController.css";

type Direction = "forward" | "backward";

/** Repeated print is DOM, never a second live controller/outlet/effect tree. */
function PrintReplica({ source, name }: { source: () => HTMLElement | undefined; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  useLayoutEffect(() => {
    let observer: MutationObserver | undefined;
    let frame = 0;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const original = source();
      if (!original || !host.current) { frame = requestAnimationFrame(connect); return; }
      const copy = () => {
        if (!host.current) return;
        const clone = original.cloneNode(true) as HTMLElement;
        clone.inert = true;
        clone.setAttribute("aria-hidden", "true");
        const identifiers = new Map<string, string>();
        for (const element of [clone, ...clone.querySelectorAll<HTMLElement>("[id]")]) {
          if (element.id) { const next = `page-print-${id}-${element.id}`; identifiers.set(element.id, next); element.id = next; }
        }
        for (const element of [clone, ...clone.querySelectorAll("*")]) for (const attribute of Array.from(element.attributes)) {
          let value = attribute.value;
          for (const [old, next] of identifiers) {
            value = value.replaceAll(`url(#${old})`, `url(#${next})`);
            if (["for", "aria-labelledby", "aria-describedby", "aria-controls"].includes(attribute.name)) value = value.split(" ").map(token => token === old ? next : token).join(" ");
            if (attribute.name === "href" && value === `#${old}`) value = `#${next}`;
          }
          if (value !== attribute.value) element.setAttribute(attribute.name, value);
        }
        const canvases = original.querySelectorAll("canvas");
        clone.querySelectorAll("canvas").forEach((canvas, index) => {
          try { canvas.getContext("2d")?.drawImage(canvases[index]!, 0, 0); } catch { /* A lost graphics surface retains its DOM fallback. */ }
        });
        host.current.replaceChildren(clone);
      };
      copy();
      observer = new MutationObserver(copy);
      observer.observe(original, { subtree: true, childList: true, attributes: true, characterData: true });
    };
    connect();
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [source, id]);
  return <div ref={host} className="nse-page-controller__print" data-page-print={name} aria-hidden="true" inert />;
}

/** @internal The existing book-curl leaves, composed from child controller views. */
export function NSEPageCurlView({ controller }: { readonly controller: NSEPageController<unknown> }) {
  useObserve(controller);
  const state = controller.getSnapshot();
  const bridge = pageCurlConnection(controller);
  const objects = controller.arrangedObjects;
  const spread = controller.spineLocation === "mid";
  const index = controller.selectedIndex;
  const base = spread ? index - index % 2 : index;
  const [corners, setCorners] = useState<{ forward: NSEPageCorner; backward: NSEPageCorner }>({ forward: "bottom-right", backward: "bottom-left" });
  const sources = useRef(new Map<unknown, HTMLElement>());
  // A surface keeps its source callback across progress renders, so replicas
  // never restart or run React views during a drag frame.
  const readers = useRef(new Map<unknown, () => HTMLElement | undefined>());
  const sourceFor = (object: unknown) => {
    let read = readers.current.get(object);
    if (!read) { read = () => sources.current.get(object); readers.current.set(object, read); }
    return read;
  };
  const clamp = (value: number) => Math.max(0, Math.min(objects.length - 1, value));
  const frontBack = clamp(spread ? base : index);
  const frontForward = clamp(spread ? base + 1 : index);
  const owners = new Map<unknown, string>();
  // The visible fronts own the real views; hidden repeats are inert print.
  owners.set(objects[frontForward], "forward-front");
  if (spread && frontBack !== frontForward) owners.set(objects[frontBack], "backward-front");
  function face(pageIndex: number, name: string) {
    if (!objects.length) return null;
    const page = clamp(pageIndex);
    const object = objects[page];
    if (!owners.has(object)) owners.set(object, name);
    if (owners.get(object) !== name) return <PrintReplica key={`${name}:${page}`} source={sourceFor(object)} name={name} />;
    const Page = controller.viewControllerAt(page);
    return <div className="nse-page-controller__page" ref={element => {
      if (element) sources.current.set(object, element);
      else sources.current.delete(object);
    }} inert={name.endsWith("front") ? undefined : true}>
      {Page ? <NSEUntransitionedChildView key={page} controller={Page} /> : null}
    </div>;
  }
  const attachForward = useCallback((leaf: NSEPageHandle | null) => bridge.attach("forward", leaf), [bridge]);
  const attachBackward = useCallback((leaf: NSEPageHandle | null) => bridge.attach("backward", leaf), [bridge]);
  useLayoutEffect(() => () => bridge.reset(), [bridge]);
  const captureCorner = (direction: Direction, event: PointerEvent<HTMLElement>) => {
    if (state.turnDirection) return;
    const box = event.currentTarget.getBoundingClientRect();
    const corner: NSEPageCorner = `${event.clientY < box.top + box.height / 2 ? "top" : "bottom"}-${direction === "forward" ? "right" : "left"}`;
    flushSync(() => setCorners(current => current[direction] === corner ? current : { ...current, [direction]: corner }));
  };
  function leaf(direction: Direction) {
    const forward = direction === "forward";
    const canTurn = forward ? controller.canNavigateForward : controller.canNavigateBack;
    const front = forward ? frontForward : frontBack;
    const inside = spread ? base + (forward ? 3 : -2) : index + (forward ? 1 : -1);
    const back = spread ? base + (forward ? 2 : -1) : inside;
    return <NSEPageCurlLeaf
      ref={forward ? attachForward : attachBackward}
      preset="bookCurl"
      curlUnderside={spread ? "back" : "print-through"}
      edge={forward ? "right" : "left"}
      corner={corners[direction]}
      onPointerDownCapture={event => captureCorner(direction, event)}
      direction={direction}
      reducedMotion={controller.traitCollection.reducedMotion}
      className={`nse-page-controller__leaf nse-page-controller__leaf--${direction}`}
      front={face(front, `${direction}-front`)}
      inside={face(inside, `${direction}-inside`)}
      back={<>
        <div className="nse-page-controller__reverse">{face(back, `${direction}-back`)}</div>
        <div className="nse-page__curl-ghost" aria-hidden="true">{face(front, `${direction}-ghost`)}</div>
      </>}
      dogEar={canTurn}
      dogEarLabel={forward ? "Next page" : "Previous page"}
      disabled={!canTurn || (state.turnDirection != null && state.turnDirection !== direction)}
      interactive={{ edges: [forward ? "right" : "left"], edgeActivationSize: 72, snapThreshold: spread ? 0.42 : 0.22, preventScroll: true }}
      onProgressChange={bridge.progress}
      onTurnEnd={bridge.end}
    />;
  }
  return <div className="nse-page-controller nse-page-controller--curl" aria-label={controller.title}
    data-nse-control="page-controller" data-transition-style="pageCurl" data-spine-location={controller.spineLocation}
    data-selected-index={index} data-turn-progress={state.turnProgress} data-turn-direction={state.turnDirection ?? undefined}>
    {spread || controller.canNavigateBack ? leaf("backward") : null}
    {objects.length ? leaf("forward") : null}
  </div>;
}
