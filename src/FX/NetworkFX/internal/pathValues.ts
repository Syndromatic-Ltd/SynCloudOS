/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NWFXPath } from "../NWFXPath";
import { NWFXInterface } from "../NWFXInterface";
import type { NetworkPathSnapshot, NetworkInterfaceSnapshot } from "./networkPort";
export const pathValues = new WeakMap<NWFXPath, NetworkPathSnapshot>();
export const interfaceValues = new WeakMap<NWFXInterface, NetworkInterfaceSnapshot>();
export const pathInterfaces = new WeakMap<NWFXPath, readonly NWFXInterface[]>();
export function createNetworkPath(value: NetworkPathSnapshot): NWFXPath {
  const path = Object.create(NWFXPath.prototype) as NWFXPath;
  const interfaces = value.interfaces?.map(item => {
    const networkInterface = Object.create(NWFXInterface.prototype) as NWFXInterface;
    interfaceValues.set(networkInterface, Object.freeze({ ...item })); return Object.freeze(networkInterface);
  });
  if (interfaces) pathInterfaces.set(path, Object.freeze(interfaces));
  pathValues.set(path, Object.freeze({ ...value, ...(value.interfaceTypes ? { interfaceTypes: Object.freeze([...value.interfaceTypes]) } : {}),
    ...(value.interfaces ? { interfaces: Object.freeze(value.interfaces.map(item => Object.freeze({ ...item }))) } : {}) }));
  return Object.freeze(path);
}
