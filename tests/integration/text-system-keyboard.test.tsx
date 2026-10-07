/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextSystemExampleView } from "../../examples/TextSystem.app/Contents/view";
import type { TextSystemExample, TextSystemExampleSnapshot } from "../../examples/TextSystem.app/Contents/example";

// The engine's gesture admission is tested separately. Here the real view owns
// keyboard routing; replace only text input/layout machinery unrelated to it.
vi.mock("@syndromatic/syncloudos/nse/text", async importOriginal => ({
  ...await importOriginal<object>(),
  NSETextInputClient: class { dispose() {} },
  NSETextInputHost: React.forwardRef((_props, ref) => {
    const input = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
    return <textarea ref={input} aria-label="Text input" />;
  }),
}));

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(SVGElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(SVGElement.prototype, "setPointerCapture");
});

function fixture() {
  const state = {
    zoom: 1, activeView: "body", fontSizeState: { state: "unset" },
    history: { canUndo: false, canRedo: false }, geometryReady: true,
    object: { x: 0, y: 0, width: 10, height: 10 }, objectPreview: null,
    revision: 0, bodyText: "", captionText: "", error: null, canSaveNative: false,
  } as TextSystemExampleSnapshot;
  const target = { documentId: "document", revision: 0, objectId: "image" };
  const selection = { range: { location: 0, length: 0 }, focus: 0, affinity: "downstream" };
  const session = { getSnapshot: () => ({ selection }) };
  const cancel = vi.fn();
  const begin = vi.fn((_lifetime?: { signal?: AbortSignal }) => target);
  const example = {
    getSnapshot: () => state, subscribe: () => () => {},
    sessions: { body: session, caption: session, bodyMirror: session },
    resources: { image: { toPNG: () => new Uint8Array([0]) } },
    layoutFor: () => null, setPresentation: () => {}, activate: vi.fn(),
    transformsFor: () => ({ client: {
      from: { name: "container:0", units: "css-pixels" },
      to: { name: "css-client", units: "css-pixels" }, revision: 0,
      matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    } }),
    beginObjectMove: begin, cancelObjectMove: cancel,
  } as unknown as TextSystemExample;
  const bubbled = vi.fn();
  const view = render(<div onKeyDown={bubbled}><TextSystemExampleView example={example} /></div>);
  const body = view.getByTestId("body-surface");
  const object = view.getByTestId("body-object");
  fireEvent.pointerDown(object, { clientX: 1, clientY: 1, pointerId: 1 });
  expect(begin).toHaveBeenCalledOnce();
  return { view, body, cancel, begin, target, bubbled };
}

it("only lets the originating surface cancel its object gesture with Escape", () => {
  const { view, body, cancel, target } = fixture();
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.keyDown(view.getByTestId("body-mirror-surface"), { key: "Escape" });
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.keyDown(body.querySelector("textarea")!, { key: "Escape" });
  expect(cancel).toHaveBeenCalledExactlyOnceWith(target);
  fireEvent.keyDown(body, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
});

it("focuses the owning input and leaves an already handled Escape alone", () => {
  const { body, cancel } = fixture();
  const input = body.querySelector("textarea")!;
  expect(document.activeElement).toBe(input);
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  event.preventDefault();
  fireEvent(input, event);
  expect(cancel).not.toHaveBeenCalled();
});

it("revokes the captured gesture lifetime when its surface unmounts", () => {
  const { view, begin, cancel } = fixture();
  const lifetime = begin.mock.calls[0]?.[0] as { signal: AbortSignal } | undefined;
  expect(lifetime?.signal.aborted).toBe(false);
  view.unmount();
  expect(lifetime?.signal.aborted).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(cancel).not.toHaveBeenCalled();
});

it("leaves composition keys alone and consumes only a gesture's Escape", () => {
  const { body, cancel, bubbled } = fixture();
  const input = body.querySelector("textarea")!;
  fireEvent.keyDown(input, { key: "Escape", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(cancel).not.toHaveBeenCalled();
  bubbled.mockClear();
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  fireEvent(input, event);
  expect(event.defaultPrevented).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(bubbled).not.toHaveBeenCalled();
});
