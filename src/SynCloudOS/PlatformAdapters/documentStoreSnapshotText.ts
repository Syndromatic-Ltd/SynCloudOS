import { SynCloudOSDocumentStorePayloadError } from "../DocumentStore/documentStoreErrors";

// Private on-disk representation. Public snapshot import/export remains schema 2.
// Schema 3 makes older writers refuse this representation instead of treating
// an unfamiliar envelope as an empty store and overwriting its history.
const encoding = "SynCloudOS.DocumentStore.StringTable.v1";
const compactThreshold = 256 * 1024;
const maxDictionaryEntries = 100_000;
type Encoded = null | boolean | number | string | [0, number] | [1, Encoded[]] | [2, Record<string, Encoded>];

// This scans JSON.stringify's already-valid output, without reparsing/cloning
// every ordinary save. It counts values, not object keys, exactly as snapshot
// hydration's existing 80-depth / 250,000-node / 16MiB admission does.
function assertHydratableSnapshotText(json: string): void {
  if (new TextEncoder().encode(json).byteLength > 16 * 1024 * 1024) {
    throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshot exceeds the 16777216 byte limit.");
  }
  let depth = 0, nodes = 0;
  const value = () => {
    if (depth > 80) throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshot exceeds the 80 depth limit.");
    if (++nodes > 250_000) throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshot exceeds the 250000 node limit.");
  };
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '"') {
      for (index++; index < json.length; index++) {
        if (json[index] === "\\") index++;
        else if (json[index] === '"') break;
      }
      if (json[index + 1] !== ":") value();
    } else if (character === "{" || character === "[") {
      value(); depth++;
    } else if (character === "}" || character === "]") depth--;
    else if (character === "t" || character === "n") { value(); index += 3; }
    else if (character === "f") { value(); index += 4; }
    else if (character === "-" || (character! >= "0" && character! <= "9")) {
      value();
      while (index + 1 < json.length && "0123456789eE+-.".includes(json[index + 1]!)) index++;
    }
  }
}

export function documentStoreSnapshotText(value: unknown): string {
  const plain = JSON.stringify(value);
  assertHydratableSnapshotText(plain);
  if (plain.length < compactThreshold) return plain;
  // Normalise optional fields exactly as the previous JSON storage did.
  const snapshot: unknown = JSON.parse(plain);
  const counts = new Map<string, number>();
  const visit = (node: unknown): void => {
    if (typeof node === "string" && node.length >= 64) counts.set(node, (counts.get(node) ?? 0) + 1);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(snapshot);
  const strings = [...counts].filter(([, count]) => count > 1).slice(0, maxDictionaryEntries).map(([text]) => text);
  if (!strings.length) return plain;
  const indices = new Map(strings.map((text, index) => [text, index]));
  const encode = (node: unknown): Encoded => {
    if (typeof node === "string") {
      const index = indices.get(node);
      return index === undefined ? node : [0, index];
    }
    if (Array.isArray(node)) return [1, node.map(encode)];
    if (node && typeof node === "object") return [2, Object.fromEntries(Object.entries(node).map(([key, child]) => [key, encode(child)]))];
    return node as null | boolean | number;
  };
  const compact = JSON.stringify({ schemaVersion: 3, encoding, strings, snapshot: encode(snapshot) });
  if (compact.length >= plain.length) return plain;
  return compact;
}

export function readDocumentStoreSnapshotValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (envelope.schemaVersion !== 3 || envelope.encoding !== encoding) return value;
  const invalid = (): never => { throw new SynCloudOSDocumentStorePayloadError("The compact DocumentStore snapshot is corrupt or exceeds its safety limits."); };
  if (Object.keys(envelope).length !== 4 || !Array.isArray(envelope.strings)
    || envelope.strings.length > maxDictionaryEntries || !envelope.strings.every(text => typeof text === "string")) invalid();
  const strings = envelope.strings as string[];
  let nodes = 0, characters = 0;
  const text = (value: string): string => {
    characters += value.length;
    if (characters > 64 * 1024 * 1024) invalid();
    return value;
  };
  const decode = (node: unknown, depth: number): unknown => {
    if (++nodes > 1_000_000 || depth > 256) invalid();
    if (typeof node === "string") return text(node);
    if (node === null || typeof node === "boolean" || (typeof node === "number" && Number.isFinite(node))) return node;
    if (!Array.isArray(node) || node.length !== 2) return invalid();
    const [tag, payload] = node;
    if (tag === 0) {
      if (!Number.isSafeInteger(payload) || payload < 0 || payload >= strings.length) return invalid();
      return text(strings[payload]!);
    }
    if (tag === 1 && Array.isArray(payload)) return payload.map(child => decode(child, depth + 1));
    if (tag === 2 && payload && typeof payload === "object" && !Array.isArray(payload)) {
      return Object.fromEntries(Object.entries(payload).map(([key, child]) => [text(key), decode(child, depth + 1)]));
    }
    return invalid();
  };
  const snapshot = decode(envelope.snapshot, 0);
  if (!snapshot || typeof snapshot !== "object" || (snapshot as { schemaVersion?: unknown }).schemaVersion !== 2) invalid();
  return snapshot;
}
