import { atmoWorkspaceArtwork } from "../Themes/Atmo/workspaceArtwork";

/** NSWorkspace: shared file artwork lookup. Sources are directly usable by NSEImageView. */
export class NSEWorkspace {
  static readonly shared = new NSEWorkspace();

  /** NSWorkspace.icon(for: UTType). Accepts a uniform type identifier or MIME content type. */
  icon(contentType: string, size: 24 | 48 | 96 = 48, scale: 1 | 2 = 2): string {
    const folder = ["public.folder", "public.directory", "inode/directory"].includes(contentType.toLowerCase());
    return this.#art(folder ? "folder-ordinary" : "document-generic", size, scale);
  }

  /** NSWorkspace.icon(forFile:). A directory handle supplies its kind without inventing a filesystem URL. */
  iconForFile(file: string | { readonly name: string; readonly kind?: string; readonly type?: string }, size: 24 | 48 | 96 = 48, scale: 1 | 2 = 2): string {
    const name = typeof file === "string" ? file.replace(/\\/gu, "/").replace(/\/$/u, "").split("/").at(-1) ?? file : file.name;
    const directory = typeof file === "string" ? /[/\\]$/u.test(file) : file.kind === "directory";
    if (!directory) return this.icon(typeof file === "string" ? "public.data" : file.type ?? "public.data", size, scale);
    const slot = ({ documents: "folder-documents", downloads: "folder-downloads", music: "folder-music", "application support": "folder-documents", "app storage": "folder-documents" } as Readonly<Record<string, string>>)[name.toLowerCase()] ?? "folder-ordinary";
    return this.#art(slot, size, scale);
  }

  #art(slot: string, size: number, scale: number): string {
    return atmoWorkspaceArtwork[`${slot}:${size}:${scale}`]!;
  }
}
