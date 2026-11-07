import { describe, expect, it } from "vitest";
import { documentStoreSnapshotText, readDocumentStoreSnapshotValue } from "../../src/SynCloudOS/PlatformAdapters/documentStoreSnapshotText";
import { createPersistenceDocumentStore } from "../../src/SynCloudOS/DocumentStore/PersistenceDocumentStore";

const encoding = "SynCloudOS.DocumentStore.StringTable.v1";
describe("private compact DocumentStore persistence", () => {
  it("round-trips literal reference-shaped arrays, reserved keys and all JSON primitives", () => {
    const record = JSON.parse('{"__proto__":{"polluted":true},"constructor":7,"literal":[0,0],"nested":[1,[2,{}]],"zero":0,"no":false,"empty":"","nil":null}');
    const image = "data:image/png;base64," + "abcdef".repeat(30_000);
    const snapshot = { schemaVersion: 2, records: [record, { image }, { image }, { image }] };
    const text = documentStoreSnapshotText(snapshot);
    expect(text.length).toBeLessThan(JSON.stringify(snapshot).length / 2);
    expect(JSON.parse(text).schemaVersion).toBe(3);
    const restored = readDocumentStoreSnapshotValue(JSON.parse(text));
    expect(restored).toEqual(snapshot);
    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(Object.hasOwn((restored as typeof snapshot).records[0], "__proto__")).toBe(true);
  });

  it("retains small and non-redundant snapshots as ordinary JSON", () => {
    const snapshot = { schemaVersion: 2, text: "unique".repeat(60_000) };
    expect(documentStoreSnapshotText(snapshot)).toBe(JSON.stringify(snapshot));
    expect(readDocumentStoreSnapshotValue(snapshot)).toBe(snapshot);
  });

  it.each([-1, 1, 0.5, "0"])("refuses invalid string reference %s instead of returning an empty store", index => {
    const envelope = { schemaVersion: 3, encoding, strings: ["original"], snapshot: [0, index] };
    const original = JSON.stringify(envelope);
    expect(() => createPersistenceDocumentStore({ persistence: { getPreference: () => envelope } as never })).toThrow(/compact DocumentStore snapshot/i);
    expect(JSON.stringify(envelope)).toBe(original);
  });

  it("bounds reference expansion and rejects unexpected untagged objects", () => {
    expect(() => readDocumentStoreSnapshotValue({ schemaVersion: 3, encoding, strings: ["x".repeat(1024)], snapshot: [1, Array.from({ length: 70_000 }, () => [0, 0])] })).toThrow(/safety limits/i);
    expect(() => readDocumentStoreSnapshotValue({ schemaVersion: 3, encoding, strings: [], snapshot: { schemaVersion: 2 } })).toThrow(/corrupt/i);
  });

  it("does not mistake an unknown future storage format for an empty store", () => {
    const envelope = { schemaVersion: 3, encoding: "unknown", strings: [], snapshot: [] };
    expect(() => createPersistenceDocumentStore({ persistence: { getPreference: () => envelope } as never })).toThrow(/schema/i);
  });

  it("does not write a compact snapshot that exceeds the existing decoded hydration budget", () => {
    const image = "x".repeat(6 * 1024 * 1024);
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, records: [image, image, image] })).toThrow(/byte limit/i);
  });

  it("round-trips dictionary saturation within the existing snapshot admission budget", () => {
    const strings = Array.from({ length: 100_001 }, (_, index) => String(index).padStart(64, "0"));
    const snapshot = { schemaVersion: 2, records: [...strings, ...strings] };
    const encoded = JSON.parse(documentStoreSnapshotText(snapshot));
    expect(readDocumentStoreSnapshotValue(encoded)).toEqual(snapshot);
    expect(encoded.strings.length).toBeLessThanOrEqual(100_000);
  });

  it("refuses oversized noncompact node counts before writing an unreadable snapshot", () => {
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, records: Array(250_001).fill(0) })).toThrow(/node limit/i);
  });

  it("applies the hydration depth limit to small noncompact snapshots too", () => {
    let nested: unknown = 0;
    for (let index = 0; index < 82; index++) nested = [nested];
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, nested })).toThrow(/depth/i);
  });

  it("counts values rather than quoted keys, escaped delimiters or numeric characters", () => {
    const snapshot = { schemaVersion: 2, 'quoted"key:[]{}': [null, true, false, -1.5e25, 2e-30, 'escaped\\"[]{}:123truefalse', { '0': "" }] };
    expect(JSON.parse(documentStoreSnapshotText(snapshot))).toEqual(snapshot);
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, records: Array(249_997).fill(0) })).not.toThrow();
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, records: Array(249_998).fill(0) })).toThrow(/node limit/i);
    let nested: unknown = "edge";
    for (let index = 0; index < 79; index++) nested = [nested];
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, nested })).not.toThrow();
    expect(() => documentStoreSnapshotText({ schemaVersion: 2, nested: [nested] })).toThrow(/depth/i);
  });
});
