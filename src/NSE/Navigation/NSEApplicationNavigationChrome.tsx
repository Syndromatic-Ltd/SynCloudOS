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

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
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

export interface NSEApplicationNavigationChromeSnapshot {
  readonly revision: number;
  readonly active: NSEApplicationNavigationChromeState | null;
}

export type NSEApplicationNavigationChromeClaimState = Readonly<{
  readonly title: string;
  readonly back: NSEApplicationNavigationChromeState["back"];
}>;

export interface NSEApplicationNavigationChromeClaim {
  readonly ownerId: string;
  update(state: NSEApplicationNavigationChromeClaimState): void;
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

function freezeSnapshot(revision: number, active: NSEApplicationNavigationChromeState | null): NSEApplicationNavigationChromeSnapshot {
  return Object.freeze({ revision, active });
}

/** Stage-owned projection of one explicitly claimed application hierarchy. */
export class NSEApplicationNavigationChromeController {
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

  getSnapshot = (): NSEApplicationNavigationChromeSnapshot => this.#snapshot;

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

  claim(ownerId: string): NSEApplicationNavigationChromeClaim | null {
    if (this.#disposed) return null;
    const normalizedOwnerId = ownerId.trim();
    if (!normalizedOwnerId) throw new TypeError("Application navigation chrome owner id must not be empty.");
    if (this.#claim) return null;

    const token = Symbol(normalizedOwnerId);
    this.#claim = { token, ownerId: normalizedOwnerId, state: null };
    let released = false;
    return Object.freeze({
      ownerId: normalizedOwnerId,
      update: (state: NSEApplicationNavigationChromeClaimState) => {
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

const NSEApplicationNavigationChromeContext = createContext<NSEApplicationNavigationChromeController | null>(null);

export function NSEApplicationNavigationChromeProvider({
  controller,
  children,
}: {
  readonly controller: NSEApplicationNavigationChromeController;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <NSEApplicationNavigationChromeContext.Provider value={controller}>
      {children}
    </NSEApplicationNavigationChromeContext.Provider>
  );
}

/** Registers one hierarchy owner against the nearest application-stage chrome. */
export function useNSEApplicationNavigationChrome(state: NSEApplicationNavigationChromeState | null): void {
  const controller = useContext(NSEApplicationNavigationChromeContext);
  const claim = useRef<NSEApplicationNavigationChromeClaim | null>(null);
  const ownerId = state?.ownerId ?? null;

  useLayoutEffect(() => {
    if (!controller || !ownerId) return undefined;
    const nextClaim = controller.claim(ownerId);
    claim.current = nextClaim;
    if (nextClaim && state) nextClaim.update({ title: state.title, back: state.back });
    return () => {
      nextClaim?.release();
      if (claim.current === nextClaim) claim.current = null;
    };
  }, [controller, ownerId]);

  useLayoutEffect(() => {
    if (!state) return;
    claim.current?.update({ title: state.title, back: state.back });
  }, [state]);

}
