import type { NSEActionOptions } from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
import type { SynWareCommandDeclaration } from "../../src/SynCloudOS/AppSDK/appRuntimeTypes";

type HeadingPayload = { readonly level: number };
type CommandTitle = SynWareCommandDeclaration<HeadingPayload, unknown>["title"];
type ActionTitle = NonNullable<NSEActionOptions<HeadingPayload>["title"]>;
type Resolver = Extract<ActionTitle, (...arguments_: never[]) => unknown>;
type Assert<Condition extends true> = Condition;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;

type AcceptsOrdinaryCommandTitle = Assert<CommandTitle extends ActionTitle ? true : false>;
type KeepsPayload = Assert<Equal<Parameters<Resolver>[0]["payload"], HeadingPayload>>;
type KeepsLevel = Assert<Equal<Parameters<Resolver>[0]["payload"]["level"], number>>;
// @ts-expect-error The title resolver does not lose its declared payload type.
type MissingField = Parameters<Resolver>[0]["payload"]["missing"];
