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

// @vitest-environment jsdom
import React, { StrictMode, Suspense } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CNFXContactStore } from "../../../src/FX/ContactsFX/public";
import { useContacts } from "../../../src/SynCloudOS/AppSDK/hooks/useContacts";

const context = vi.hoisted(() => ({ contacts: { createContactStore: vi.fn() } }));
vi.mock("../../../src/SynCloudOS/AppSDK/scos/useSCOS", () => ({ useSCOS: () => context }));
afterEach(cleanup);

it("creates component owners at commit and disposes Contacts through StrictMode replay", () => {
  const contactOwners: { signal: AbortSignal; dispose: ReturnType<typeof vi.fn> }[] = [];
  context.contacts.createContactStore.mockImplementation((signal: AbortSignal) => {
    const dispose = vi.fn(); contactOwners.push({ signal, dispose });
    return { dispose };
  });
  let contacts!: CNFXContactStore;
  function Probe() { contacts = useContacts(); return null; }
  const view = render(<StrictMode><Probe /></StrictMode>);
  expect(contactOwners).toHaveLength(2);
  expect(contactOwners[0]!.signal.aborted).toBe(true);
  expect(contactOwners[1]!.signal.aborted).toBe(false);
  view.unmount();
  expect(contactOwners.every(owner => owner.dispose.mock.calls.length === 1)).toBe(true);
  expect(contacts.getCapabilities().contactPicker).toBe(false);
});

it("does not create owners for suspended renders", () => {
  context.contacts.createContactStore.mockClear();
  const pending = new Promise(() => {});
  function Probe(): React.ReactNode { useContacts(); throw pending; }
  render(<Suspense fallback={null}><Probe /></Suspense>);
  expect(context.contacts.createContactStore).not.toHaveBeenCalled();
});
