import type { NSEPageController } from "./NSEPageController";
import type { PageEvent, PageHandle } from "./pageTypes";

/** Private renderer connection; no engine types appear on the public controller. */
export interface PageCurlConnection {
  attach(direction: "forward" | "backward", leaf: PageHandle | null): void;
  progress(progress: number, event: PageEvent): void;
  end(event: PageEvent): void;
  layFlat(): void;
  reset(): void;
}
const connections = new WeakMap<NSEPageController<unknown>, PageCurlConnection>();
export function connectPageCurl(controller: NSEPageController<unknown>, connection: PageCurlConnection): void { connections.set(controller, connection); }
export function pageCurlConnection(controller: NSEPageController<unknown>): PageCurlConnection { return connections.get(controller)!; }
