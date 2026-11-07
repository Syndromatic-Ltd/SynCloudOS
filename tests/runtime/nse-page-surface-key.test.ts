// @vitest-environment jsdom
import { expect, it } from "vitest";
import { pageSurfaceKey } from "../../src/NSE/Page/pageSurfaceKey";

it("adopts prefetched controller print despite host/outlet wrapper differences, and invalidates changed content", () => {
  const inside = document.createElement("div");
  inside.className = "nse-page__inside";
  inside.innerHTML = '<div class="nse-page-controller__page" inert><div data-nse-view-controller tabindex="-1"><article><img src="plate.png">Plate</article></div></div>';
  const front = document.createElement("div");
  front.className = "nse-page__face--front";
  front.innerHTML = '<div class="nse-page-controller__page"><div data-nse-view-controller tabindex="-1"><article><img src="plate.png">Plate</article></div></div>';
  expect(pageSurfaceKey(front)).toBe(pageSurfaceKey(inside));
  front.querySelector("article")!.append(" changed");
  expect(pageSurfaceKey(front)).not.toBe(pageSurfaceKey(inside));
  const back = inside.cloneNode(true) as HTMLElement;
  back.className = "nse-page__face--back";
  expect(pageSurfaceKey(back)).not.toBe(pageSurfaceKey(inside));
});
