// @vitest-environment jsdom
import { expect, it } from "vitest";
import { contentInlineSize } from "../../src/SynCloudOS/AppHosting/contentInlineSize";

it("gives toolbar items the bar's content width, not its frame, so the last item is never clipped", () => {
  const bar = document.createElement("div");
  document.body.append(bar);
  expect(contentInlineSize(bar, 1440)).toBe(1440);
  // The window toolbar pads ten pixels a side: items that were allocated 1440 ran 20 past its clip.
  bar.style.padding = "3px 10px 2px";
  expect(contentInlineSize(bar, 1440)).toBe(1420);
  bar.style.borderLeft = "1px solid";
  expect(contentInlineSize(bar, 1440)).toBe(1419);
  expect(contentInlineSize(bar, 5)).toBe(0);
  bar.remove();
});
