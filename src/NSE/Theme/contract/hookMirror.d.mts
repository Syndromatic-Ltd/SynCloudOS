/** Hook names, without the `data-nse-` prefix, that have mirror classes. */
export declare const mirroredHookNames: ReadonlySet<string>;
/** A value can be a class token only if it is non-empty and has no whitespace. */
export declare function isMirrorValue(value: unknown): value is string;
/** The hook name of a mirrored attribute, or null for any other attribute. */
export declare function mirroredHookName(attribute: string): string | null;
/** Class tokens for one hook: presence always, value when it can be a token. */
export declare function mirrorTokens(name: string, value: unknown): readonly string[];
/** Props with mirror tokens appended to `className`; the same object when no mirrored hook is published. */
export declare function mirrorProps<P>(props: P): P;
/** Whether a class token is a mirror token. */
export declare function isMirrorToken(token: string): boolean;
/** The class selector equal to the attribute selector, or null when the attribute form must stay. */
export declare function mirrorSelector(name: string, value: string | null): string | null;
