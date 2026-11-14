/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { NSEControllerLifetime } from "../Controllers/controllerLifetime";
import type { NSEControllerOwnershipOptions } from "../Controllers/ownership";

export interface NSEApplicationNavigationChromeState {
  readonly ownerId: string;
  readonly title: string;
  readonly back: null | {
    readonly label: string;
    readonly onActivate: () => void;
  };
}

export interface ApplicationNavigationChromeSnapshot {
  readonly revision: number;
  readonly active: NSEApplicationNavigationChromeState | null;
}

export type ApplicationNavigationChromeClaimState = Readonly<{
  readonly title: string;
  readonly back: NSEApplicationNavigationChromeState["back"];
}>;

export interface ApplicationNavigationChromeClaim {
  readonly ownerId: string;
  update(state: ApplicationNavigationChromeClaimState): void;
  release(): void;
}

function cloneState(state: NSEApplicationNavigationChromeState): NSEApplicationNavigationChromeState {
  if (!state.ownerId.trim()) throw new TypeError("Application navigation chrome owner id must not be empty.");
  return Object.freeze({
    ownerId: state.ownerId,
    title: state.title,
    back: state.back ? Object.freeze({ label: state.back.label, onActivate: state.back.onActivate }) : null,
  });
}

function statesEqual(left: NSEApplicationNavigationChromeState | undefined, right: NSEApplicationNavigationChromeState): boolean {
  return left?.ownerId === right.ownerId &&
    left.title === right.title &&
    left.back?.label === right.back?.label &&
    left.back?.onActivate === right.back?.onActivate;
}

function freezeSnapshot(revision: number, active: NSEApplicationNavigationChromeState | null): ApplicationNavigationChromeSnapshot {
  return Object.freeze({ revision, active });
}

/** Stage-owned projection of one explicitly claimed application hierarchy. */
export class ApplicationNavigationChromeController {
  readonly #listeners = new Set<() => void>();
  #claim: null | {
    readonly token: symbol;
    readonly ownerId: string;
    state: NSEApplicationNavigationChromeState | null;
  } = null;
  #revision = 0;
  #snapshot = freezeSnapshot(0, null);
  #disposed = false;
  readonly #lifetime: NSEControllerLifetime;

  constructor(options: NSEControllerOwnershipOptions = {}) {
    this.#lifetime = new NSEControllerLifetime(options, { kind: "NSEApplicationNavigationChromeController", id: "navigation-chrome" });
    this.#lifetime.bind(() => this.dispose());
  }

  get isDisposed(): boolean { return this.#disposed; }

  getSnapshot = (): ApplicationNavigationChromeSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  };

  claim(ownerId: string): ApplicationNavigationChromeClaim | null {
    if (this.#disposed) return null;
    const normalizedOwnerId = ownerId.trim();
    if (!normalizedOwnerId) throw new TypeError("Application navigation chrome owner id must not be empty.");
    if (this.#claim) return null;

    const token = Symbol(normalizedOwnerId);
    this.#claim = { token, ownerId: normalizedOwnerId, state: null };
    let released = false;
    return Object.freeze({
      ownerId: normalizedOwnerId,
      update: (state: ApplicationNavigationChromeClaimState) => {
        if (released || this.#disposed || this.#claim?.token !== token) return;
        const next = cloneState({ ownerId: normalizedOwnerId, ...state });
        if (statesEqual(this.#claim.state ?? undefined, next)) return;
        this.#claim.state = next;
        this.#publish(next);
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.#disposed || this.#claim?.token !== token) return;
        const hadState = this.#claim.state !== null;
        this.#claim = null;
        if (hadState) this.#publish(null);
      },
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime.dispose();
    this.#claim = null;
    this.#listeners.clear();
    this.#snapshot = freezeSnapshot(this.#revision, null);
  }

  #publish(active: NSEApplicationNavigationChromeState | null): void {
    this.#revision += 1;
    this.#snapshot = freezeSnapshot(this.#revision, active);
    for (const listener of [...this.#listeners]) listener();
  }
}

const ApplicationNavigationChromeContext = createContext<ApplicationNavigationChromeController | null>(null);
const StandardNavigationChromeAvailableContext = createContext(true);
const ControllerNavigationChromeBoundaryContext = createContext(false);

export function ApplicationNavigationChromeProvider({
  controller,
  children,
  standardChromeAvailable = true,
}: {
  readonly controller: ApplicationNavigationChromeController;
  readonly children?: ReactNode;
  /** @internal Whether this host actually renders standard application chrome. */
  readonly standardChromeAvailable?: boolean;
}): ReactNode {
  return (
    <ApplicationNavigationChromeContext.Provider value={controller}>
      <StandardNavigationChromeAvailableContext.Provider value={standardChromeAvailable}>{children}</StandardNavigationChromeAvailableContext.Provider>
    </ApplicationNavigationChromeContext.Provider>
  );
}

/** Registers one hierarchy owner against the nearest application-stage chrome. */
export function useNSEApplicationNavigationChrome(state: NSEApplicationNavigationChromeState | null): void {
  const controller = useContext(ApplicationNavigationChromeContext);
  useNavigationChromeClaim(controller, state);
}

/** @internal A default container owns the application boundary; embedded containers keep local chrome. */
export function ControllerNavigationChromeBoundary({ children }: { readonly children: ReactNode }): ReactNode {
  return <ControllerNavigationChromeBoundaryContext.Provider value={true}>{children}</ControllerNavigationChromeBoundaryContext.Provider>;
}

/** @internal The default controller renderers need to know whether the stage accepted their claim. */
export function useNSEControllerNavigationChrome(state: NSEApplicationNavigationChromeState | null): boolean {
  const controller = useContext(ApplicationNavigationChromeContext);
  const available = useContext(StandardNavigationChromeAvailableContext);
  const embedded = useContext(ControllerNavigationChromeBoundaryContext);
  const effectiveState = available && !embedded ? state : null;
  useNavigationChromeClaim(controller, effectiveState);
  const snapshot = useSyncExternalStore(controller?.subscribe ?? noNavigationChromeSubscription,
    controller?.getSnapshot ?? noNavigationChromeSnapshot, controller?.getSnapshot ?? noNavigationChromeSnapshot);
  return effectiveState !== null && snapshot?.active?.ownerId === effectiveState.ownerId;
}

const noNavigationChromeSubscription = () => () => {};
const noNavigationChromeSnapshot = () => null;

function useNavigationChromeClaim(controller: ApplicationNavigationChromeController | null, state: NSEApplicationNavigationChromeState | null): void {
  const claim = useRef<ApplicationNavigationChromeClaim | null>(null);
  const ownerId = state?.ownerId ?? null;

  const latestState = useRef(state);
  latestState.current = state;
  useLayoutEffect(() => {
    if (!controller || !ownerId) return undefined;
    // A default container can release chrome after its initial compact layout.
    // Retain the pending owner and retry the claim when that slot becomes free.
    const acquire = () => {
      const current = latestState.current;
      if (claim.current || !current || current.ownerId !== ownerId) return;
      const nextClaim = controller.claim(ownerId);
      if (!nextClaim) return;
      claim.current = nextClaim;
      nextClaim.update({ title: current.title, back: current.back });
    };
    const unsubscribe = controller.subscribe(acquire);
    acquire();
    return () => {
      unsubscribe();
      const previousClaim = claim.current;
      claim.current = null;
      previousClaim?.release();
    };
  }, [controller, ownerId]);

  useLayoutEffect(() => {
    if (!state) return;
    claim.current?.update({ title: state.title, back: state.back });
  }, [state]);
}
