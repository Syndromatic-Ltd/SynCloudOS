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

import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  win32,
} from "node:path";

function addError(errors, message) {
  if (!errors.includes(message)) errors.push(message);
}

function isPortableAbsolute(path) {
  return isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path);
}

function isInside(root, candidate) {
  const relation = relative(root, candidate);
  return (
    relation === "" ||
    (!relation.startsWith("..") &&
      !isAbsolute(relation) &&
      !win32.isAbsolute(relation))
  );
}

function nearestExisting(path) {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return candidate;
}

export function validateRepositoryPath(input = {}) {
  const errors = [];
  const options = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    addError(errors, "repository path validation input must be an object");
  }
  const owner = typeof options.owner === "string" && options.owner.trim() !== ""
    ? options.owner
    : "repository";
  let repositoryRoot;
  try {
    repositoryRoot = resolve(
      typeof options.root === "string" && options.root.trim() !== ""
        ? options.root
        : process.cwd(),
    );
  } catch {
    addError(errors, `${owner} root cannot be resolved safely`);
    return { ok: false, path: null, absolute: null, errors };
  }
  const path = options.path;
  const mustExist = options.mustExist === true;
  if (
    typeof path !== "string" ||
    path.trim() === "" ||
    /[\0\r\n]/.test(path) ||
    isPortableAbsolute(path)
  ) {
    addError(errors, `${owner} path ${String(path)} must be repository-relative`);
    return { ok: false, path: null, absolute: null, errors };
  }

  const normal = path.replaceAll("\\", "/");
  if (
    normal.startsWith("/") ||
    normal.split("/").includes("..") ||
    normal.split("/").includes(".")
  ) {
    addError(errors, `${owner} path ${path} escapes the repository`);
    return { ok: false, path: null, absolute: null, errors };
  }

  const absolute = resolve(repositoryRoot, ...normal.split("/"));
  if (!isInside(repositoryRoot, absolute)) {
    addError(errors, `${owner} path ${path} escapes the repository`);
    return { ok: false, path: null, absolute: null, errors };
  }
  if (mustExist && !existsSync(absolute)) {
    addError(errors, `${owner} path ${path} does not exist`);
    return { ok: false, path: normal, absolute, errors };
  }

  const existing = nearestExisting(absolute);
  if (existing) {
    try {
      const realRoot = realpathSync.native(repositoryRoot);
      const realExisting = realpathSync.native(existing);
      if (!isInside(realRoot, realExisting)) {
        addError(
          errors,
          `${owner} path ${path} resolves through a symlink escape`,
        );
      }
      if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
        const realAbsolute = realpathSync.native(absolute);
        if (!isInside(realRoot, realAbsolute)) {
          addError(
            errors,
            `${owner} path ${path} resolves through a symlink escape`,
          );
        }
      }
    } catch {
      addError(errors, `${owner} path ${path} cannot be resolved safely`);
    }
  }

  return {
    ok: errors.length === 0,
    path: normal,
    absolute,
    errors,
  };
}

export function readContainedRepositoryText(root, path, owner = "repository authority") {
  const validation = validateRepositoryPath({ root, path, owner, mustExist: true });
  if (!validation.ok) return { text: null, path: validation.path, errors: [...validation.errors] };
  try {
    return { text: readFileSync(validation.absolute, "utf8"), path: validation.path, errors: [] };
  } catch {
    return { text: null, path: validation.path, errors: [`${owner} path ${path} cannot be read`] };
  }
}
