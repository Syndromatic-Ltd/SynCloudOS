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

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The entry map is a plain ES module with a declaration-free consumer.
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const repositoryRoot = process.cwd();
const frameworkRoot = resolve(repositoryRoot, "docs", "framework");
const packageName = "@syndromatic/syncloudos";

function markdownFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

const documents = [resolve(repositoryRoot, "README.md"), ...markdownFiles(frameworkRoot)];

function read(file: string) {
  return readFileSync(file, "utf8").replace(/\r\n?/gu, "\n");
}

function withoutCode(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/gu, "");
}

function localLinks(markdown: string) {
  return [...withoutCode(markdown).matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu)]
    .map((match) => match[1]!.replace(/^<|>$/gu, ""))
    .filter((target) => !/^(?:https?:|mailto:)/iu.test(target));
}

function slug(heading: string) {
  return heading
    .toLowerCase()
    .replace(/`/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/gu, "-");
}

function anchors(markdown: string) {
  return new Set([...withoutCode(markdown).matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => slug(match[1]!)));
}

describe("framework documentation", () => {
  it("links only to files and headings that exist", () => {
    const errors: string[] = [];
    for (const file of documents) {
      for (const target of localLinks(read(file))) {
        const [pathPart, anchor] = target.split("#");
        const destination = pathPart ? resolve(dirname(file), pathPart) : file;
        const inside = relative(repositoryRoot, destination);
        if (inside.startsWith("..") || !existsSync(destination)) {
          errors.push(`${relative(repositoryRoot, file)} links to missing ${target}`);
          continue;
        }
        if (anchor && destination.endsWith(".md") && !anchors(read(destination)).has(anchor)) {
          errors.push(`${relative(repositoryRoot, file)} links to missing heading ${target}`);
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it("links every guide from the framework index", () => {
    const linked = new Set<string>();
    const queue = [resolve(frameworkRoot, "README.md")];
    while (queue.length) {
      const page = queue.pop()!;
      for (const target of localLinks(read(page))) {
        const destination = resolve(dirname(page), target.split("#")[0]!);
        if (!destination.endsWith(".md") || linked.has(destination) || !existsSync(destination)) continue;
        linked.add(destination);
        queue.push(destination);
      }
    }
    const unlinked = markdownFiles(frameworkRoot)
      .filter((file) => file !== resolve(frameworkRoot, "README.md"))
      .filter((file) => !linked.has(file))
      .map((file) => relative(repositoryRoot, file));
    expect(unlinked).toEqual([]);
  });

  it("names only package entries that exist", () => {
    const entries = Object.keys(synWareSdkEntries as Record<string, string>);
    const known = new Set([...entries, "vite"]);
    const stylesheet = (entry: string) => entry.endsWith("/styles.css") && known.has(entry.slice(0, -"/styles.css".length));
    const errors: string[] = [];
    for (const file of documents) {
      for (const match of read(file).matchAll(/@syndromatic\/syncloudos\/([A-Za-z0-9/._-]+)/gu)) {
        const entry = match[1]!.replace(/[.,;:]+$/u, "");
        if (!known.has(entry) && !stylesheet(entry)) errors.push(`${relative(repositoryRoot, file)} names unknown entry ${packageName}/${entry}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it("describes the framework without internal project language", () => {
    const banned = [
      /cappuccino/iu,
      /programme\s+\d/iu,
      /superpowers/iu,
      /capability[- ]parity/iu,
      /worktree/iu,
      /\bPrelude\b/u,
      /\bPalm\b/u,
      /\bEnyo\b/u,
      /\bAristo\b/u,
      /\bAurore/u,
      /\bDial\b/u,
      /npm\.cmd/u,
    ];
    const errors: string[] = [];
    for (const file of documents) {
      const text = read(file);
      for (const pattern of banned) {
        if (pattern.test(text)) errors.push(`${relative(repositoryRoot, file)} matches ${pattern}`);
      }
    }
    expect(errors).toEqual([]);
  });
});
