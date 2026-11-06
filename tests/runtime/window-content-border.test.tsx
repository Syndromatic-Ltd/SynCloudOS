// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEWindowContentBorder } from "../../src/SynCloudOS/AppHosting/windowChrome";
import { NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";

afterEach(cleanup);

describe("a window's bottom content border", () => {
  it("draws a band behind the content and an edge above it, sized by the thickness", () => {
    const view = render(<NSEWindowContentBorder thickness={56} />);
    const band = view.container.querySelector<HTMLElement>(".nse-window-content-border")!;
    const edge = view.container.querySelector<HTMLElement>(".nse-window-content-border-edge")!;
    expect(band.dataset.edge).toBe("minY");
    expect(band.dataset.size).toBe("large");
    expect(band.getAttribute("aria-hidden")).toBe("true");
    expect(band.style.getPropertyValue("--nse-window-content-border-thickness")).toBe("56px");
    expect(edge.dataset.size).toBe("large");
    view.rerender(<NSEWindowContentBorder thickness={24} />);
    expect(view.container.querySelector<HTMLElement>(".nse-window-content-border")!.dataset.size).toBe("small");
  });

  it("draws labels on it raised (NSCell.backgroundStyle)", () => {
    const view = render(<>
      <NSETextField isEditable={false} backgroundStyle="raised">33 words</NSETextField>
      <NSETextField isEditable={false}>Plain</NSETextField>
    </>);
    expect(view.getByText("33 words").dataset.backgroundStyle).toBe("raised");
    expect(view.getByText("Plain").dataset.backgroundStyle).toBeUndefined();
  });
});
