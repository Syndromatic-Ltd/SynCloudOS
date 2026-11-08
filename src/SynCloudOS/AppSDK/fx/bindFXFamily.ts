import { normalizeBundleIdentifier } from "../../Identity/bundleIdentifier.mjs";
import { fxAttributedClass, fxBoundApplication } from "./fxIdentity";

const classes = new WeakMap<Function, Map<string, Function>>();

/** Used only by compiler-generated modules. Unmarked values retain identity. */
export function bindFXFamily<Family extends object>(family: Family, appID: string): Family {
  const identity = normalizeBundleIdentifier(appID);
  return Object.freeze(Object.fromEntries(Object.entries(family).map(([name, value]) => {
    if (typeof value !== "function" || Reflect.get(value, fxAttributedClass) !== true) return [name, value];
    let applications = classes.get(value);
    if (!applications) { applications = new Map(); classes.set(value, applications); }
    let bound = applications.get(identity);
    if (!bound) {
      bound = class extends value {};
      Object.defineProperty(bound, "name", { value: value.name, configurable: true });
      Object.defineProperty(bound, fxBoundApplication, { value: identity });
      applications.set(identity, bound);
    }
    return [name, bound];
  }))) as Family;
}
