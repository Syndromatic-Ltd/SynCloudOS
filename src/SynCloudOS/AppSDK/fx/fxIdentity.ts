/** Private compiler metadata. It carries attribution, never a live session. */
export const fxAttributedClass = Symbol("FX attributed class");
export const fxBoundApplication = Symbol("FX application identity");

export function fxApplicationID(type: Function): string {
  const appID: unknown = Reflect.get(type, fxBoundApplication);
  if (typeof appID === "string") return appID;
  throw new Error(`${type.name} must be created by an application compiled with the SynCloudOS plugin; import it from code inside an application bundle`);
}
