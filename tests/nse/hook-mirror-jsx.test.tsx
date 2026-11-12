// @vitest-environment jsdom
/** @jsxRuntime automatic */
// The automatic runtime is what application source compiles to, and what the mirror wraps.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nseControlHooks, nsePartHooks } from "../../src/NSE/Theme/contract/hooks";

const tokens = (node: Element) => [...node.classList];

describe("contract hooks are mirrored into classes by the JSX runtime", () => {
  it("mirrors hooks beside the caller's own classes and keeps every attribute", () => {
    const { container } = render(<div className="mine" data-nse-control="button" data-nse-hovered="" data-nse-key-equivalent={" "} data-nse-toolbar-item-id="save" />);
    const node = container.firstElementChild!;
    expect(node.getAttribute("data-nse-control")).toBe("button");
    expect(node.getAttribute("data-nse-key-equivalent")).toBe(" ");
    expect(node.getAttribute("data-nse-toolbar-item-id")).toBe("save");
    expect(tokens(node)).toEqual(["mine", "nse:control", "nse:control=button", "nse:hovered", "nse:key-equivalent"]);
  });

  it("removes a token when its hook goes away on re-render", () => {
    const view = (selected: boolean) => <div data-nse-part="row" data-nse-selected={selected ? "" : undefined} />;
    const { container, rerender } = render(view(true));
    expect(tokens(container.firstElementChild!)).toEqual(["nse:part", "nse:part=row", "nse:selected"]);
    rerender(view(false));
    expect(tokens(container.firstElementChild!)).toEqual(["nse:part", "nse:part=row"]);
    expect(container.firstElementChild!.hasAttribute("data-nse-selected")).toBe(false);
  });

  it("mirrors hooks spread from the contract helpers", () => {
    const { container } = render(<button {...nseControlHooks({ control: "button", enabled: false, variants: { "bezel-style": "rounded" } })}><span {...nsePartHooks("title")} /></button>);
    const button = container.firstElementChild!;
    expect(tokens(button)).toEqual(["nse:control", "nse:control=button", "nse:enabled", "nse:enabled=false", "nse:bezel-style", "nse:bezel-style=rounded"]);
    expect(tokens(button.firstElementChild!)).toEqual(["nse:part", "nse:part=title"]);
  });

  it("leaves elements without hooks, and components, untouched", () => {
    const Component = (props: { readonly "data-nse-part"?: string; readonly className?: string }) => <i data-probe={props.className ?? "none"} />;
    const { container } = render(<><p className="plain" /><Component data-nse-part="row" /></>);
    expect(container.querySelector("p")!.className).toBe("plain");
    // A component receives its props as written; only the host element it renders is mirrored.
    expect(container.querySelector("i")!.getAttribute("data-probe")).toBe("none");
  });
});
