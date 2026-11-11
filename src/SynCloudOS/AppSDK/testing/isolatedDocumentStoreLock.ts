import type { SynCloudOSDocumentStoreLock } from "../../DocumentStore";

/** Serialises all writers to the test host's private persistence. This local
 * queue is not a cross-context lock for a shared browser or server store. */
export function createIsolatedDocumentStoreLock(): SynCloudOSDocumentStoreLock {
  const idle = Promise.resolve();
  const tails = new Map<string, Promise<void>>();
  return Object.freeze({
    request<T>(name: string, options: { readonly mode: "exclusive"; readonly signal?: AbortSignal }, callback: () => T | Promise<T>): Promise<T> {
      const signal = options.signal;
      if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Document-store lock acquisition aborted.", "AbortError"));
      const previous = tails.get(name) ?? idle;
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const tail = previous.then(() => held);
      tails.set(name, tail);
      void tail.then(() => { if (tails.get(name) === tail) tails.delete(name); });
      return new Promise<T>((resolve, reject) => {
        let cancelled = false;
        const abort = () => {
          cancelled = true;
          release();
          reject(signal?.reason ?? new DOMException("Document-store lock acquisition aborted.", "AbortError"));
        };
        signal?.addEventListener("abort", abort, { once: true });
        void previous.then(async () => {
          if (cancelled) return;
          signal?.removeEventListener("abort", abort);
          try { resolve(await callback()); }
          catch (error) { reject(error); }
          finally { release(); }
        });
      });
    },
  });
}
