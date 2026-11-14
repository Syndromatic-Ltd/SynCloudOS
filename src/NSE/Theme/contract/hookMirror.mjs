/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Mirror classes: a private copy of contract hooks that the style engine can index.
 *
 * The public contract is `data-nse-*` attributes. Chrome files attribute rules by attribute name
 * only, so the build rewrites contract attribute selectors to these classes and the runtime writes
 * the classes beside the attributes. Shared by the build scripts and the browser runtime.
 */

const states = ["state", "highlighted", "enabled", "selected", "hovered", "focused", "key-window", "tracking"];
const variants = [
  "bezel-style", "control-size", "segment-style", "box-type", "toolbar-style", "chrome", "button-type", "slider-type",
  "login-presentation", "notification-presentation", "appearance-name", "key-equivalent", "has-destructive-action", "image-position",
  "sort-direction", "selection-highlight-style", "highlight-style", "material", "transparent", "custom-fill", "custom-border", "shadow", "shadow-suppressed", "validation", "value-state", "revealed", "indeterminate", "height", "expanded", "orientation", "alignment", "position", "placement", "flow", "style", "role", "type", "edge", "level",
  "pulls-down", "title-position", "border-type", "image-scaling", "text-role", "text-colour", "background-style", "editable", "date-picker-style", "date-picker-mode", "date-picker-elements", "navigation-placement", "navigation-flow", "distribution", "menu-flash", "menu-chosen", "brightness-placement", "toolbar-size-mode", "toolbar-bordered", "presentation", "content-border", "view-layer", "corner-curve", "surface-ink",
];
const appearance = ["theme", "colour-scheme-resolved", "contrast", "transparency"];

/** Hook names, without the `data-nse-` prefix, that have mirror classes. Data-carrying attributes do not. */
export const mirroredHookNames = Object.freeze(new Set(["control", "part", ...states, ...variants, ...appearance]));

const attributePrefix = "data-nse-";
const whitespace = /\s/u;

/** A value can be a class token only if it is non-empty and has no whitespace. */
export function isMirrorValue(value) {
  return typeof value === "string" && value !== "" && !whitespace.test(value);
}

/** The hook name of a mirrored attribute, or null for any other attribute. */
export function mirroredHookName(attribute) {
  if (!attribute.startsWith(attributePrefix)) return null;
  const name = attribute.slice(attributePrefix.length);
  return mirroredHookNames.has(name) ? name : null;
}

/** Class tokens for one hook: presence always, value when it can be a token. */
export function mirrorTokens(name, value) {
  return isMirrorValue(value) ? [`nse:${name}`, `nse:${name}=${value}`] : [`nse:${name}`];
}

const tokenCache = new Map();
function cachedTokens(name, value) {
  const key = `${name}\0${value}`;
  let tokens = tokenCache.get(key);
  if (tokens === undefined) {
    tokens = mirrorTokens(name, value).join(" ");
    // Values are a closed vocabulary in practice; the bound only guards against a runaway caller.
    if (tokenCache.size < 4096) tokenCache.set(key, tokens);
  }
  return tokens;
}

/**
 * Props for a host element with mirror tokens appended to `className`, or the same object when the
 * element publishes no mirrored hook. A hook that React would not render (null, undefined, false) has none.
 */
export function mirrorProps(props) {
  if (props === null || typeof props !== "object") return props;
  let tokens = "";
  for (const key in props) {
    // 100 is "d": a cheap reject for the common props before the string comparison.
    if (key.charCodeAt(0) !== 100 || !key.startsWith(attributePrefix)) continue;
    const value = props[key];
    if (value === null || value === undefined || value === false) continue;
    const name = key.slice(attributePrefix.length);
    if (!mirroredHookNames.has(name)) continue;
    tokens += (tokens ? " " : "") + cachedTokens(name, typeof value === "string" ? value : String(value));
  }
  const own = typeof props.className === "string" ? withoutMirrorTokens(props.className) : props.className;
  if (!tokens) return own === props.className ? props : { ...props, className: own || undefined };
  return { ...props, className: own ? `${own} ${tokens}` : tokens };
}

/** A class list without mirror tokens: a cloned element may carry ones its new hooks no longer justify. */
function withoutMirrorTokens(className) {
  if (!className.includes("nse:")) return className;
  return className.split(" ").filter(token => token && !isMirrorToken(token)).join(" ");
}

/** Whether a class token is a mirror token. */
export function isMirrorToken(token) {
  return token.startsWith("nse:");
}

const identifierEscape = /[^a-zA-Z0-9_-]/gu;
const escapeIdentifier = text => text.replace(identifierEscape, character => character.codePointAt(0) > 0x7f ? character : `\\${character}`);

/**
 * The class selector equal to `[data-nse-<name>]` (value null) or `[data-nse-<name>="<value>"]`,
 * or null when the attribute form must stay.
 */
export function mirrorSelector(name, value) {
  if (!mirroredHookNames.has(name)) return null;
  if (value === null) return `.${escapeIdentifier(`nse:${name}`)}`;
  return isMirrorValue(value) ? `.${escapeIdentifier(`nse:${name}=${value}`)}` : null;
}
