// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEObject, observable, useObserve } from "../../../src/NSE/Objects";

afterEach(cleanup);

class Note extends NSEObject {
  @observable accessor title = "Untitled";
  @observable accessor pinned = false;
}

class Folder extends NSEObject {
  @observable accessor name = "Inbox";
}

/** An object that keeps its own immutable snapshot, as a controller does. */
class Counter extends NSEObject<{ readonly count: number }> {
  #snapshot = { count: 0 };
  @observable accessor label = "A";
  override getSnapshot() { return this.#snapshot; }
  increment() {
    this.#snapshot = { count: this.#snapshot.count + 1 };
    this.notifyObservers();
  }
}

describe("observable properties", () => {
  it("re-renders once for one change", () => {
    const note = new Note();
    let renders = 0;
    function View() {
      useObserve(note);
      renders += 1;
      return <p>{note.title}</p>;
    }
    const view = render(<View />);
    const initial = renders;
    act(() => { note.title = "Shopping"; });
    expect(view.container.textContent).toBe("Shopping");
    expect(renders).toBe(initial + 1);
  });

  it("does not re-render when set to an equal value", () => {
    const note = new Note();
    let renders = 0;
    function View() {
      useObserve(note);
      renders += 1;
      return <p>{note.title}</p>;
    }
    render(<View />);
    const initial = renders;
    act(() => { note.title = "Untitled"; });
    act(() => { note.pinned = false; });
    expect(renders).toBe(initial);
  });

  it("observes several objects from one view", () => {
    const note = new Note();
    const folder = new Folder();
    let count = 0;
    function Both() {
      useObserve(note);
      useObserve(folder);
      count += 1;
      return <p>{folder.name}/{note.title}</p>;
    }
    const both = render(<Both />);
    const initial = count;
    act(() => { folder.name = "Archive"; });
    expect(both.container.textContent).toBe("Archive/Untitled");
    act(() => { note.title = "Receipts"; });
    expect(both.container.textContent).toBe("Archive/Receipts");
    expect(count).toBe(initial + 2);
  });

  it("returns the object and accepts null", () => {
    const note = new Note();
    let seen: unknown;
    function View({ target }: { target: Note | null }) {
      seen = useObserve(target);
      return null;
    }
    const view = render(<View target={note} />);
    expect(seen).toBe(note);
    view.rerender(<View target={null} />);
    expect(seen).toBeNull();
  });

  it("re-renders for an accessor write on an object that overrides getSnapshot", () => {
    const counter = new Counter();
    function View() {
      useObserve(counter);
      return <p>{counter.label}:{counter.getSnapshot().count}</p>;
    }
    const view = render(<View />);
    act(() => { counter.label = "B"; });
    expect(view.container.textContent).toBe("B:0");
    act(() => { counter.increment(); });
    expect(view.container.textContent).toBe("B:1");
  });

  it("keeps each object's state separate", () => {
    const first = new Note();
    const second = new Note();
    first.title = "One";
    expect(second.title).toBe("Untitled");
    expect(first.title).toBe("One");
  });

  it("keeps state when the object's prototype is swapped for a newer class", () => {
    const note = new Note();
    note.title = "Draft";
    class NoteV2 extends NSEObject {
      @observable accessor title = "Untitled";
      @observable accessor pinned = false;
      shout() { return this.title.toUpperCase(); }
    }
    Object.setPrototypeOf(note, NoteV2.prototype);
    const swapped = note as unknown as NoteV2;
    expect(swapped.title).toBe("Draft");
    expect(swapped.shout()).toBe("DRAFT");
    function View() {
      useObserve(swapped);
      return <p>{swapped.title}</p>;
    }
    const view = render(<View />);
    act(() => { swapped.title = "Final"; });
    expect(view.container.textContent).toBe("Final");
  });
});
