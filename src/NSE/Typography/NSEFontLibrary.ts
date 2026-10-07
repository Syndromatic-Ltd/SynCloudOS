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

import type { NSEFontFamily, NSEFontPreset } from "../Text/fontDescriptors";

/**
 * The fonts a person adds themselves, with the font panel's Favourites and
 * Recently Used collections: reusable imported font metadata and collections.
 *
 * A font file is read by TextFX (HarfBuzz) before anything else sees it: it
 * must parse as a face with head and cmap tables, and its own name and OS/2
 * tables name it and place it in a family. It is then loaded as a FontFace
 * under a private family ("nse-user-<digest>") so it can never shadow or be
 * shadowed by a system font, and kept in IndexedDB so it is there next time.
 * The digest is of the file's bytes, so adding the same file twice adds it
 * once, and a document's reference to it survives a reload.
 */

export interface NSEUserFontFace {
  readonly id: string;
  readonly familyName: string;
  readonly styleName: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly cssFamily: string;
  readonly fileName: string;
}

export interface NSEStoredUserFont {
  readonly id: string;
  readonly fileName: string;
  readonly bytes: ArrayBuffer;
}

/** Where added fonts are kept between sessions. */
export interface NSEUserFontStorage {
  load(): Promise<readonly NSEStoredUserFont[]>;
  save(font: NSEStoredUserFont): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Makes a font's bytes renderable under a CSS family; returns its release. */
export interface NSEUserFontFaceHost {
  register(cssFamily: string, bytes: ArrayBuffer): Promise<() => void>;
}

/** Small persisted lists (favourites, recents). */
export interface NSEFontPreferenceStore {
  read(key: string): readonly string[];
  write(key: string, value: readonly string[]): void;
}

export interface NSEFontImportResult {
  readonly added: readonly NSEUserFontFace[];
  readonly rejected: readonly { readonly fileName: string; readonly reason: string }[];
}

export interface NSEFontLibrarySnapshot {
  readonly userFamilies: readonly NSEFontFamily[];
  readonly favourites: readonly string[];
  readonly recents: readonly string[];
}

export interface NSEFontLibraryOptions {
  readonly storage?: NSEUserFontStorage | null;
  readonly faceHost?: NSEUserFontFaceHost | null;
  readonly preferences?: NSEFontPreferenceStore | null;
}

const userFontIdPattern = /^user-[0-9a-f]{12}$/;
const maximumFontBytes = 32 * 1024 * 1024;
const maximumUserFonts = 256;
const maximumRecents = 12;
const favouritesKey = "nse.font-library.favourites";
const recentsKey = "nse.font-library.recents";

export function isNSEUserFontId(id: unknown): id is string {
  return typeof id === "string" && userFontIdPattern.test(id);
}

/** The private CSS family a user font renders under, derived from its id so a
 * document can name it before the font has been restored. */
export function cssFamilyForNSEUserFont(id: string): string {
  return `nse-user-${id.slice("user-".length)}`;
}

function stackFor(cssFamily: string): string {
  return `"${cssFamily}", system-ui, sans-serif`;
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hash = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return [...hash.slice(0, 6)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // FNV-1a, twice over, where SubtleCrypto is unavailable (insecure origins).
  const view = new Uint8Array(bytes);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (const byte of view) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x811c9dc5) >>> 0;
  }
  return (first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0")).slice(0, 12);
}

type FontContainer = "sfnt" | "woff" | "collection" | "unknown";

function containerOf(bytes: ArrayBuffer): FontContainer {
  if (bytes.byteLength < 12) return "unknown";
  const tag = new DataView(bytes).getUint32(0);
  if (tag === 0x00010000 || tag === 0x4f54544f /* OTTO */ || tag === 0x74727565 /* true */) return "sfnt";
  if (tag === 0x774f4646 /* wOFF */ || tag === 0x774f4632 /* wOF2 */) return "woff";
  if (tag === 0x74746366 /* ttcf */) return "collection";
  return "unknown";
}

/** "Inter-SemiBoldItalic.woff2" → Inter / Semi Bold Italic, for the web
 * formats HarfBuzz cannot open. */
function namesFromFileName(fileName: string): { familyName: string; styleName: string; weight: number; italic: boolean } {
  const stem = fileName.replace(/\.[^.]+$/, "").trim() || "Untitled";
  const [familyPart, stylePart = "Regular"] = stem.split(/[-_](?=[^-_]*$)/);
  const styleName = stylePart.replace(/([a-z])([A-Z])/g, "$1 $2").trim() || "Regular";
  const weights: readonly [RegExp, number][] = [[/thin|hairline/i, 100], [/extra\s?light|ultra\s?light/i, 200], [/light/i, 300], [/medium/i, 500], [/semi\s?bold|demi/i, 600], [/extra\s?bold|ultra\s?bold/i, 800], [/black|heavy/i, 900], [/bold/i, 700]];
  const weight = weights.find(([pattern]) => pattern.test(styleName))?.[1] ?? 400;
  return { familyName: familyPart!.replace(/([a-z])([A-Z])/g, "$1 $2").trim() || stem, styleName, weight, italic: /italic|oblique/i.test(styleName) };
}

async function readNames(bytes: ArrayBuffer, fileName: string): Promise<{ familyName: string; styleName: string; weight: number; italic: boolean }> {
  const container = containerOf(bytes);
  if (container === "collection") throw new TypeError("Font collections (.ttc) can't be added; add the fonts inside it one by one.");
  if (container === "unknown") throw new TypeError("This isn't a font file SynCloudOS can read (TrueType, OpenType, WOFF or WOFF2).");
  if (container === "woff") return namesFromFileName(fileName);
  const [{ TFXFont }, { TFXFontDescriptor }] = await Promise.all([import("../../FX/TextFX/TFXFont"), import("../../FX/TextFX/TFXFontDescriptor")]);
  let font: Awaited<ReturnType<typeof TFXFont.create>>;
  try {
    font = await TFXFont.create(new Uint8Array(bytes), new TFXFontDescriptor({ size: 12 }));
  } catch {
    throw new TypeError("The font file is damaged or unsupported.");
  }
  try {
    return { familyName: font.typographicFamilyName.trim().slice(0, 96) || "Untitled", styleName: font.styleName.trim().slice(0, 64) || "Regular", weight: font.weight, italic: font.italic };
  } finally {
    font.dispose();
  }
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "font";
}

function freezeList(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

export class NSEFontLibrary {
  readonly #storage: NSEUserFontStorage | null;
  readonly #faceHost: NSEUserFontFaceHost | null;
  readonly #preferences: NSEFontPreferenceStore | null;
  readonly #faces = new Map<string, { readonly face: NSEUserFontFace; readonly preset: NSEFontPreset; readonly bytes: Uint8Array; readonly release: () => void }>();
  readonly #listeners = new Set<() => void>();
  #favourites: readonly string[];
  #recents: readonly string[];
  #snapshot: NSEFontLibrarySnapshot;
  #restoring: Promise<void> | null = null;

  constructor(options: NSEFontLibraryOptions = {}) {
    this.#storage = options.storage ?? null;
    this.#faceHost = options.faceHost ?? null;
    this.#preferences = options.preferences ?? null;
    this.#favourites = freezeList(this.#readPreference(favouritesKey));
    this.#recents = freezeList(this.#readPreference(recentsKey));
    this.#snapshot = this.#buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  getSnapshot = (): NSEFontLibrarySnapshot => this.#snapshot;

  get canAddFonts(): boolean {
    return this.#faceHost !== null;
  }

  userPreset(id: unknown): NSEFontPreset | undefined {
    return typeof id === "string" ? this.#faces.get(id)?.preset : undefined;
  }

  userFace(id: unknown): NSEUserFontFace | undefined {
    return typeof id === "string" ? this.#faces.get(id)?.face : undefined;
  }

  /** An owned copy of a successfully installed imported face, for byte-backed layout. */
  fontBytes(id: string): Uint8Array | null {
    return this.#faces.get(id)?.bytes.slice() ?? null;
  }


  /** Loads the fonts kept from earlier sessions; safe to call repeatedly. */
  restore(): Promise<void> {
    if (!this.#storage || !this.#faceHost) return Promise.resolve();
    this.#restoring ??= (async () => {
      let stored: readonly NSEStoredUserFont[] = [];
      try { stored = await this.#storage!.load(); } catch { return; }
      let changed = false;
      for (const record of stored.slice(0, maximumUserFonts)) {
        if (!isNSEUserFontId(record.id) || this.#faces.has(record.id)) continue;
        try {
          await this.#install(record.id, record.fileName, record.bytes);
          changed = true;
        } catch {
          // A font that no longer loads is left in storage for a later
          // browser that can read it; it just isn't offered.
        }
      }
      if (changed) this.#publish();
    })();
    return this.#restoring;
  }

  async addFonts(files: readonly Pick<File, "name" | "size" | "arrayBuffer">[]): Promise<NSEFontImportResult> {
    const added: NSEUserFontFace[] = [];
    const rejected: { fileName: string; reason: string }[] = [];
    for (const file of files) {
      const fileName = String(file.name).slice(0, 255) || "Untitled";
      try {
        if (!this.#faceHost) throw new TypeError("This browser can't load fonts.");
        if (this.#faces.size >= maximumUserFonts) throw new RangeError(`You can add up to ${maximumUserFonts} fonts.`);
        if (file.size < 12 || file.size > maximumFontBytes) throw new RangeError("Font files must be smaller than 32 MB.");
        const bytes = await file.arrayBuffer();
        const id = `user-${await digest(bytes)}`;
        if (this.#faces.has(id)) throw new TypeError("This font has already been added.");
        const face = await this.#install(id, fileName, bytes);
        added.push(face);
        try { await this.#storage?.save({ id, fileName, bytes }); } catch { /* kept for this session only */ }
      } catch (error) {
        rejected.push({ fileName, reason: error instanceof Error ? error.message : "The font couldn't be added." });
      }
    }
    if (added.length > 0) this.#publish();
    return Object.freeze({ added: Object.freeze(added), rejected: Object.freeze(rejected) });
  }

  async removeFont(id: string): Promise<boolean> {
    const entry = this.#faces.get(id);
    if (!entry) return false;
    this.#faces.delete(id);
    entry.release();
    this.#favourites = freezeList(this.#favourites.filter((item) => item !== id));
    this.#recents = freezeList(this.#recents.filter((item) => item !== id));
    this.#writePreferences();
    this.#publish();
    try { await this.#storage?.delete(id); } catch { /* storage keeps a copy it can't remove */ }
    return true;
  }

  isFavourite(id: string): boolean {
    return this.#favourites.includes(id);
  }

  addFavourite(id: string): void {
    if (this.#favourites.includes(id)) return;
    this.#favourites = freezeList([...this.#favourites, id].slice(-64));
    this.#writePreferences();
    this.#publish();
  }

  removeFavourite(id: string): void {
    if (!this.#favourites.includes(id)) return;
    this.#favourites = freezeList(this.#favourites.filter((item) => item !== id));
    this.#writePreferences();
    this.#publish();
  }

  /** Records a font as just used, for the Recently Used collection. */
  noteUsed(id: string): void {
    if (this.#recents[0] === id) return;
    this.#recents = freezeList([id, ...this.#recents.filter((item) => item !== id)].slice(0, maximumRecents));
    this.#writePreferences();
    this.#publish();
  }

  async #install(id: string, fileName: string, bytes: ArrayBuffer): Promise<NSEUserFontFace> {
    const names = await readNames(bytes, fileName);
    const cssFamily = cssFamilyForNSEUserFont(id);
    let release: () => void;
    try {
      release = await this.#faceHost!.register(cssFamily, bytes);
    } catch {
      throw new TypeError("The browser couldn't load this font.");
    }
    const face: NSEUserFontFace = Object.freeze({ id, familyName: names.familyName, styleName: names.styleName, weight: names.weight, italic: names.italic, cssFamily, fileName });
    // The face is registered alone under its private family, so the preset
    // names no weight or style: asking for one would only synthesise it.
    const preset: NSEFontPreset = Object.freeze({ id, label: face.styleName, familyId: `user.${slug(face.familyName)}`, family: stackFor(cssFamily) });
    this.#faces.set(id, { face, preset, bytes:new Uint8Array(bytes.slice(0)), release });
    return face;
  }

  #readPreference(key: string): readonly string[] {
    try {
      const value = this.#preferences?.read(key) ?? [];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length <= 128).slice(0, 64) : [];
    } catch {
      return [];
    }
  }

  #writePreferences(): void {
    try {
      this.#preferences?.write(favouritesKey, this.#favourites);
      this.#preferences?.write(recentsKey, this.#recents);
    } catch { /* preferences are a convenience */ }
  }

  #buildSnapshot(): NSEFontLibrarySnapshot {
    const families = new Map<string, { label: string; faces: { face: NSEUserFontFace; preset: NSEFontPreset }[] }>();
    for (const entry of this.#faces.values()) {
      const family = families.get(entry.preset.familyId) ?? { label: entry.face.familyName, faces: [] };
      family.faces.push(entry);
      families.set(entry.preset.familyId, family);
    }
    const userFamilies = [...families.entries()]
      .sort(([, left], [, right]) => left.label.localeCompare(right.label))
      .map(([id, family]): NSEFontFamily => {
        const presets = family.faces
          .sort((left, right) => left.face.weight - right.face.weight || Number(left.face.italic) - Number(right.face.italic) || left.face.styleName.localeCompare(right.face.styleName))
          .map(({ preset }) => preset);
        const regular = family.faces.find(({ face }) => face.weight === 400 && !face.italic) ?? family.faces[0]!;
        return Object.freeze({ id, label: family.label, defaultPresetId: regular.preset.id, presets: Object.freeze(presets) });
      });
    return Object.freeze({ userFamilies: Object.freeze(userFamilies), favourites: this.#favourites, recents: this.#recents });
  }

  #publish(): void {
    this.#snapshot = this.#buildSnapshot();
    for (const listener of [...this.#listeners]) listener();
  }
}

/** FontFace in the page's document.fonts. */
export function createNSEBrowserFontFaceHost(): NSEUserFontFaceHost | null {
  const FontFaceConstructor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  // `in` asks without reading: document.fonts is only touched to register.
  if (!FontFaceConstructor || typeof document === "undefined" || !("fonts" in document)) return null;
  return Object.freeze({
    async register(cssFamily: string, bytes: ArrayBuffer) {
      const fonts = (document as Document & { fonts: FontFaceSet }).fonts;
      const face = new FontFaceConstructor(cssFamily, bytes.slice(0));
      await face.load();
      fonts.add(face);
      return () => { fonts.delete(face); };
    },
  });
}

const databaseName = "nse-user-fonts";
const storeName = "fonts";

/** IndexedDB, one record per font keyed by its id. */
export function createNSEIndexedDBUserFontStorage(): NSEUserFontStorage | null {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
  });
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return Object.freeze({
    async load() {
      const records = await run<unknown[]>("readonly", (store) => store.getAll());
      return records.filter((record): record is NSEStoredUserFont => {
        const candidate = record as Partial<NSEStoredUserFont> | null;
        return !!candidate && isNSEUserFontId(candidate.id) && typeof candidate.fileName === "string" && candidate.bytes instanceof ArrayBuffer;
      });
    },
    async save(font: NSEStoredUserFont) {
      await run("readwrite", (store) => store.put({ id: font.id, fileName: font.fileName, bytes: font.bytes }));
    },
    async delete(id: string) {
      await run("readwrite", (store) => store.delete(id));
    },
  });
}

/** localStorage, read and written defensively: it may be absent or refuse. */
export function createNSELocalFontPreferenceStore(): NSEFontPreferenceStore | null {
  let storage: Storage | undefined;
  try { storage = (globalThis as { localStorage?: Storage }).localStorage; } catch { return null; }
  if (!storage) return null;
  return Object.freeze({
    read(key: string) {
      try {
        const parsed: unknown = JSON.parse(storage!.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
      } catch {
        return [];
      }
    },
    write(key: string, value: readonly string[]) {
      try { storage!.setItem(key, JSON.stringify(value)); } catch { /* quota or privacy mode */ }
    },
  });
}

/** The shared library, as NSFontManager.shared: the one text clients resolve
 * user fonts from. Its browser ports are created on first use, so importing
 * NSE never touches document.fonts, IndexedDB or storage. */
let sharedLibrary: NSEFontLibrary | null = null;

export function sharedNSEFontLibrary(): NSEFontLibrary {
  sharedLibrary ??= new NSEFontLibrary({
    storage: createNSEIndexedDBUserFontStorage(),
    faceHost: createNSEBrowserFontFaceHost(),
    preferences: createNSELocalFontPreferenceStore(),
  });
  return sharedLibrary;
}
