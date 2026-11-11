/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import type { DFXQueue } from "../DispatchFX/DFXQueue";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { NFXReaderSession } from "./NFXReaderSession";
import { NFXReaderError } from "./NFXReaderError";
import { NFXNDEFMessage } from "./NFXNDEFMessage";
import type { NFXNDEFReaderSessionDelegate } from "./NFXNDEFReaderSessionDelegate";
import type { NFXNDEFTag } from "./NFXNDEFTag";
import { nfcBinding, nfcSessions } from "./internal/nfcSessionBindings";
import { nfcPortFor, nfcFailure, type NFCNativeSession, type NFCNativeTag } from "./internal/nfcPort";

/** NFCNDEFReaderSession. A null/omitted queue makes the session create its own serial queue, as Apple does.
 * Web NFC supplies scanned messages; addressed tag operations fail explicitly. */
export class NFXNDEFReaderSession extends NFXReaderSession {
  #binding;
  #session;
  #port;
  #generation;
  #queue;
  #delegate: NFXNDEFReaderSessionDelegate | null;
  #state: "idle" | "starting" | "active" | "invalidating" | "ended" = "idle";
  #owner = new AbortController();
  #native: NFCNativeSession | undefined;
  #releaseSession: (() => void) | undefined;
  #releaseAccess: (() => void) | undefined;
  #poll = 0;
  #connected: NFCNativeTag | undefined;
  #connecting = false;
  #tags = new WeakMap<NFXNDEFTag, { native: NFCNativeTag; poll: number }>();
  #firstRead;
  constructor(delegate: NFXNDEFReaderSessionDelegate, queue: DFXQueue | null = null, invalidateAfterFirstRead = true) {
    super();
    this.#binding = nfcBinding(new.target);
    this.#session = this.#binding.resolve();
    this.#port = nfcPortFor(this.#session.context);
    this.#generation = this.#port.generation;
    if (!delegate || typeof delegate.readerSessionDidInvalidateWithError !== "function")
      throw new NFXReaderError("readerErrorInvalidParameter", "An NFC invalidation delegate is required.");
    this.#queue = queue ?? new (dispatchQueueForSession(this.#session))("com.syndromatic.nfc.reader-session");
    this.#delegate = delegate;
    this.#firstRead = invalidateAfterFirstRead;
    nfcSessions.set(this, { dispose: () => this.#end() });
  }
  get delegate(): NFXNDEFReaderSessionDelegate | null {
    return this.#delegate;
  }
  get sessionQueue(): DFXQueue {
    return this.#queue;
  }
  get isReady(): boolean {
    return this.#state === "active" && this.#live();
  }
  /** Web NFC has no native alert-text presentation API; assigning fails explicitly. */
  get alertMessage(): string {
    return "";
  }
  set alertMessage(_value: string) {
    throw new NFXReaderError("readerErrorUnsupportedFeature", "Native NFC alert text is unavailable.");
  }
  begin(): void {
    this.#assertLive();
    this.#watch();
    if (this.#state !== "idle")
      throw new NFXReaderError("readerSessionInvalidationErrorSystemIsBusy", "This NFC reader session has already begun.");
    this.#state = "starting";
    void this.#port
      .open(this.#owner.signal, {
        messages: messages =>
          this.#enqueue(() => {
            if (!this.#delegate?.readerSessionDidDetectTags) {
              try {
                this.#delegate?.readerSessionDidDetectNDEFs?.(this, messages);
              } finally {
                if (this.#firstRead && this.#live()) this.#finish(new NFXReaderError("readerSessionInvalidationErrorFirstNDEFTagRead"));
              }
            }
          }),
        tags: tags => {
          const poll = this.#poll;
          const values = tags.map(tag => this.#tag(tag, poll));
          this.#enqueue(() => {
            if (poll === this.#poll) this.#delegate?.readerSessionDidDetectTags?.(this, Object.freeze(values));
          });
        },
        error: error => {
          if (this.#live()) this.#finish(nfcFailure(error));
        },
      })
      .then(
        native => {
          if (!this.#live()) {
            void native.invalidate().catch(() => {});
            return;
          }
          this.#native = native;
          this.#state = "active";
          this.#enqueue(() => this.#delegate?.readerSessionDidBecomeActive?.(this));
        },
        error => {
          if (this.#live()) this.#finish(nfcFailure(error));
        },
      );
  }
  connect(tag: NFXNDEFTag, completionHandler: (error: NFXReaderError | null) => void): void {
    this.#assertLive();
    this.#watch();
    const entry = this.#tags.get(tag);
    const poll = this.#poll;
    if (this.#state !== "active" || !entry || entry.poll !== poll) {
      this.#enqueue(() =>
        completionHandler(new NFXReaderError("readerTransceiveErrorTagNotConnected", "The tag is not detected in this reader session.")),
      );
      return;
    }
    if (this.#connected === entry.native) {
      this.#enqueue(() => completionHandler(null));
      return;
    }
    if (this.#connecting) {
      this.#enqueue(() => completionHandler(new NFXReaderError("readerSessionInvalidationErrorSystemIsBusy")));
      return;
    }
    this.#connecting = true;
    void this.#native!.connect(entry.native)
      .then(
        () => {
          if (poll !== this.#poll) return;
          this.#connected = entry.native;
          this.#enqueue(() => {
            if (poll === this.#poll) completionHandler(null);
          });
        },
        error =>
          this.#enqueue(() => {
            if (poll === this.#poll) completionHandler(nfcFailure(error));
          }),
      )
      .finally(() => {
        this.#connecting = false;
      });
  }
  restartPolling(): void {
    this.#assertLive();
    this.#watch();
    if (!this.#native || this.#state !== "active")
      throw new NFXReaderError("readerTransceiveErrorSessionInvalidated", "The NFC session is not ready.");
    this.#poll++;
    this.#connected = undefined;
    this.#native.restartPolling();
  }
  invalidate(errorMessage?: string): void {
    this.#assertLive();
    this.#watch();
    this.#finish(
      errorMessage === undefined
        ? new NFXReaderError("readerSessionInvalidationErrorUserCanceled", "The application invalidated the reader session.")
        : new NFXReaderError(
            "readerErrorUnsupportedFeature",
            "The session ended, but native NFC error-message presentation is unavailable.",
          ),
    );
  }
  #tag(native: NFCNativeTag, poll: number): NFXNDEFTag {
    const session = this;
    const operation = <T>(
      perform: () => Promise<T>,
      completion: (value: T | null, error: NFXReaderError | null) => void,
      write = false,
    ) => {
      session.#assertLive();
      session.#watch();
      const deliver = (value: T | null, error: NFXReaderError | null) =>
        session.#enqueue(() => {
          if (poll === session.#poll) completion(value, error);
        });
      try {
        session.#port.assertAccess(session.#generation, write);
        if (poll !== session.#poll || session.#connected !== native) throw new NFXReaderError("readerTransceiveErrorTagNotConnected");
        void perform().then(
          value => deliver(value, null),
          error => deliver(null, nfcFailure(error)),
        );
      } catch (error) {
        deliver(null, nfcFailure(error));
      }
    };
    const tag = Object.freeze<NFXNDEFTag>({
      get isAvailable() {
        return poll === session.#poll && session.#live() && native.isAvailable;
      },
      queryNDEFStatus(completionHandler) {
        operation(
          () => native.queryNDEFStatus(),
          (value, error) => completionHandler(value?.status ?? "notSupported", value?.capacity ?? 0, error),
        );
      },
      readNDEF(completionHandler) {
        operation(
          () => native.readNDEF(),
          (message, error) => {
            try {
              completionHandler(message, error);
            } finally {
              if (!error && session.#firstRead && session.#live())
                session.#finish(new NFXReaderError("readerSessionInvalidationErrorFirstNDEFTagRead"));
            }
          },
        );
      },
      writeNDEF(message, completionHandler) {
        const captured = new NFXNDEFMessage(message.records);
        operation(
          () => native.writeNDEF(captured),
          (_value, error) => completionHandler(error),
          true,
        );
      },
      writeLock(completionHandler) {
        operation(
          () => native.writeLock(),
          (_value, error) => completionHandler(error),
          true,
        );
      },
    });
    this.#tags.set(tag, { native, poll });
    return tag;
  }
  #watch(): void {
    this.#port.bindAccessLifetime(this.#generation);
    this.#releaseAccess ??= this.#port.observeAccessLoss(() => this.#end());
    this.#releaseSession ??= observeFXSessionEnd(this.#session, () => this.#end());
  }
  #assertLive(invalidation = false): void {
    if (this.#state === "ended" || (this.#state === "invalidating" && !invalidation))
      throw new NFXReaderError("readerTransceiveErrorSessionInvalidated");
    this.#binding.resolve();
    this.#port.assertAccess(this.#generation);
  }
  #live(invalidation = false): boolean {
    try {
      this.#assertLive(invalidation);
      return true;
    } catch {
      return false;
    }
  }
  #enqueue(work: () => void, invalidation = false): void {
    if (this.#live(invalidation))
      this.#queue.async(() => {
        if (this.#live(invalidation)) work();
      });
  }
  #finish(error: NFXReaderError): void {
    if (this.#state === "ended" || this.#state === "invalidating") return;
    this.#state = "invalidating";
    this.#poll++;
    this.#connected = undefined;
    if (!this.#native) this.#owner.abort();
    const finish = () =>
      this.#enqueue(() => {
        try {
          this.#delegate?.readerSessionDidInvalidateWithError(this, error);
        } finally {
          this.#end();
        }
      }, true);
    if (this.#native)
      void this.#native.invalidate().then(finish, failure => {
        error = nfcFailure(failure);
        finish();
      });
    else finish();
  }
  #end(): void {
    if (this.#state === "ended") return;
    this.#state = "ended";
    this.#poll++;
    this.#connected = undefined;
    this.#owner.abort();
    this.#delegate = null;
    this.#releaseSession?.();
    this.#releaseSession = undefined;
    this.#releaseAccess?.();
    this.#releaseAccess = undefined;
  }
}
Object.defineProperty(NFXNDEFReaderSession, fxAttributedClass, { value: true });
