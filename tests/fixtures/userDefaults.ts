import { NSEUserDefaults } from "../../src/NSE/Controllers/NSEUserDefaults";

/** A store written the way these tests record reads and writes. */
export interface TestDefaultsStore {
  read(key: string): unknown;
  write(key: string, value: unknown): unknown;
  remove(key: string): void;
}

/** NSEUserDefaults over a recording store; a write's result (a promise, say) reaches the controller. */
export function defaultsFrom(store: TestDefaultsStore): NSEUserDefaults {
  return new NSEUserDefaults({
    get: (key) => store.read(key),
    set: (key, value) => store.write(key, value) as void | PromiseLike<void>,
    remove: (key) => store.remove(key),
  });
}
