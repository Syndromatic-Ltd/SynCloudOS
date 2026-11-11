/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createFXSessionBinding, fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { SPFXError } from "./SPFXError";
import type { SPFXSpeechRecognitionRequest } from "./SPFXSpeechRecognitionRequest";
import type { SPFXSpeechRecognitionTask } from "./SPFXSpeechRecognitionTask";
import type { SPFXSpeechRecognitionResult } from "./SPFXSpeechRecognitionResult";
import type { SPFXSpeechRecognitionTaskDelegate } from "./SPFXSpeechRecognitionTaskDelegate";
import type { SPFXSpeechRecognizerDelegate } from "./SPFXSpeechRecognizerDelegate";
import type { SPFXSpeechRecognizerAuthorizationStatus } from "./SPFXSpeechRecognizerAuthorizationStatus";
import { speechPortFor, speechCancelled, type SpeechAuthorization } from "./internal/speechPort";
import { speechSessionBindings, speechRecognizers } from "./internal/speechSessionBindings";
import { createSpeechTask, speechTasks } from "./internal/speechTasks";
const bindingFor = (type: Function) =>
  speechSessionBindings.get(type) ??
  createFXSessionBinding(
    type,
    reason => new SPFXError("kAFAssistantErrorDomain", reason === "ended" ? 216 : 1101, `Speech application session is ${reason}.`),
  );
const authorization = (status: SpeechAuthorization): SPFXSpeechRecognizerAuthorizationStatus =>
  status === "granted" ? "authorized" : status === "denied" ? "denied" : status === "unavailable" ? "restricted" : "notDetermined";
/** SFSpeechRecognizer. Plugin-attributed, passive construction. Foundation has no NSELocale;
 * the native Intl.Locale value represents Apple's Locale. */
export class SPFXSpeechRecognizer {
  #binding;
  #session;
  #port;
  #generation;
  #locale: Intl.Locale;
  #disposed = false;
  #delegate: SPFXSpeechRecognizerDelegate | null = null;
  #tasks = new Set<SPFXSpeechRecognitionTask>();
  #releaseSession: (() => void) | undefined;
  #releaseAccess: (() => void) | undefined;
  #releaseAvailability: (() => void) | undefined;
  constructor(locale?: Intl.Locale) {
    this.#binding = bindingFor(new.target);
    this.#session = this.#binding.resolve();
    this.#port = speechPortFor(this.#session.context);
    this.#generation = this.#port.generation;
    try {
      this.#locale = new Intl.Locale(locale?.toString() ?? new Intl.DateTimeFormat().resolvedOptions().locale);
    } catch {
      throw new SPFXError("NSCocoaErrorDomain", 3840, "Invalid speech locale.");
    }
    speechRecognizers.set(this, { dispose: () => this.#dispose() });
  }
  /** Throws SPFXError when the host cannot enumerate supported recognition locales. */
  static supportedLocales(): ReadonlySet<Intl.Locale> {
    return speechPortFor(bindingFor(this).resolve().context).supportedLocales();
  }
  static authorizationStatus(): SPFXSpeechRecognizerAuthorizationStatus {
    return authorization(speechPortFor(bindingFor(this).resolve().context).authorizationStatus());
  }
  static requestAuthorization(handler: (status: SPFXSpeechRecognizerAuthorizationStatus) => void): void {
    const binding = bindingFor(this);
    const session = binding.resolve();
    const port = speechPortFor(session.context);
    const owner = new AbortController();
    const release = observeFXSessionEnd(session, () => owner.abort());
    const generation = port.generation;
    void port.requestAuthorization(owner.signal).then(
      status => {
        if (owner.signal.aborted || (status === "granted" && port.generation !== generation)) {
          release();
          return;
        }
        const deliveredGeneration = port.generation;
        dispatchQueueForSession(session).main.async(() => {
          try {
            binding.resolve();
            if (owner.signal.aborted || port.generation !== deliveredGeneration) return;
            handler(authorization(status));
          } finally {
            release();
          }
        });
      },
      () => {
        if (owner.signal.aborted || port.generation !== generation) {
          release();
          return;
        }
        try {
          dispatchQueueForSession(session).main.async(() => {
            try {
              binding.resolve();
              if (!owner.signal.aborted && port.generation === generation) handler(authorization(port.authorizationStatus()));
            } finally {
              release();
            }
          });
        } catch {
          release();
        }
      },
    );
  }
  get locale(): Intl.Locale {
    return this.#locale;
  }
  get isAvailable(): boolean {
    return this.#live() && this.#port.isAvailable(this.#locale);
  }
  get supportsOnDeviceRecognition(): boolean {
    return this.#live() && this.#port.supportsOnDeviceRecognition(this.#locale);
  }
  get delegate(): SPFXSpeechRecognizerDelegate | null {
    return this.#delegate;
  }
  set delegate(value: SPFXSpeechRecognizerDelegate | null) {
    this.#assertLive();
    this.#releaseAvailability?.();
    this.#releaseAvailability = undefined;
    this.#delegate = value;
    if (value) {
      this.#own();
      this.#releaseAvailability = this.#port.subscribeAvailability?.(this.#locale, available => {
        if (!this.#live()) return;
        dispatchQueueForSession(this.#session).main.async(() => {
          if (this.#live()) this.#delegate?.speechRecognizerAvailabilityDidChange?.(this, available);
        });
      });
    }
  }
  recognitionTask(
    request: SPFXSpeechRecognitionRequest,
    resultHandler: (result: SPFXSpeechRecognitionResult | null, error: SPFXError | null) => void,
  ): SPFXSpeechRecognitionTask;
  recognitionTask(request: SPFXSpeechRecognitionRequest, delegate: SPFXSpeechRecognitionTaskDelegate): SPFXSpeechRecognitionTask;
  recognitionTask(
    request: SPFXSpeechRecognitionRequest,
    receiver: SPFXSpeechRecognitionTaskDelegate | ((result: SPFXSpeechRecognitionResult | null, error: SPFXError | null) => void),
  ): SPFXSpeechRecognitionTask {
    this.#assertLive();
    this.#port.assertAccess(this.#generation);
    this.#own();
    let task: SPFXSpeechRecognitionTask | undefined;
    task = createSpeechTask(
      this.#session,
      this.#port,
      this.#generation,
      request,
      this.#locale,
      receiver,
      () => {
        if (task) this.#tasks.delete(task);
      },
      () => this.#live(),
    );
    if (task.state !== "completed") this.#tasks.add(task);
    return task;
  }
  #own(): void {
    if (!this.#releaseSession) {
      this.#releaseSession = observeFXSessionEnd(this.#session, () => this.#dispose());
      this.#releaseAccess = this.#port.observeAccessLoss(() => this.#dispose());
    }
  }
  #assertLive(): void {
    if (this.#disposed || this.#generation !== this.#port.generation) throw speechCancelled();
    this.#binding.resolve();
  }
  #live(): boolean {
    try {
      this.#assertLive();
      return true;
    } catch {
      this.#dispose();
      return false;
    }
  }
  #dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#releaseAvailability?.();
    this.#releaseSession?.();
    this.#releaseAccess?.();
    for (const task of this.#tasks) speechTasks.get(task)!.invalidate();
    this.#tasks.clear();
  }
}
Object.defineProperty(SPFXSpeechRecognizer, fxAttributedClass, { value: true });
