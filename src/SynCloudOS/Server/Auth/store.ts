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

import type { AuthStore, AuthTransaction, StoredAuthSession } from "./types";

/** Process-local adapter for tests and ephemeral development only; it is not durable storage. */
export class InMemoryAuthStore implements AuthStore {
  readonly #sessions = new Map<string, StoredAuthSession>();
  readonly #transactions = new Map<string, AuthTransaction>();

  async create(session: StoredAuthSession & { readonly tokenHash: string }) {
    const { tokenHash, ...stored } = session;
    this.#sessions.set(tokenHash, stored);
  }

  async find(tokenHash: string) {
    return this.#sessions.get(tokenHash) ?? null;
  }

  async revoke(tokenHash: string) {
    this.#sessions.delete(tokenHash);
  }

  async createTransaction(transaction: AuthTransaction) {
    this.#transactions.set(transaction.stateHash, transaction);
  }

  async consumeTransaction(criteria: { readonly stateHash: string; readonly browserBindingHash: string; readonly now: number }) {
    const transaction = this.#transactions.get(criteria.stateHash);
    if (!transaction || transaction.browserBindingHash !== criteria.browserBindingHash) return null;
    if (transaction.expiresAt <= criteria.now) {
      this.#transactions.delete(criteria.stateHash);
      return null;
    }
    this.#transactions.delete(criteria.stateHash);
    return transaction;
  }

}

interface D1Result<T> {
  readonly results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface SessionRow {
  readonly subject: string;
  readonly profile: string;
  readonly expires_at: number;
}

interface TransactionRow {
  readonly state_hash: string;
  readonly browser_binding_hash: string;
  readonly nonce: string;
  readonly pkce_verifier: string;
  readonly return_path: string;
  readonly expires_at: number;
}

export class D1AuthStore implements AuthStore {
  constructor(private readonly database: D1Database) {}

  async create(session: StoredAuthSession & { readonly tokenHash: string }) {
    await this.database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(Date.now()).run();
    await this.database.prepare(
      "INSERT INTO auth_sessions (token_hash, subject, profile, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(session.tokenHash, session.subject, session.profile, session.expiresAt).run();
  }

  async find(tokenHash: string) {
    const row = await this.database.prepare(
      "SELECT subject, profile, expires_at FROM auth_sessions WHERE token_hash = ?",
    ).bind(tokenHash).first<SessionRow>();
    return row ? { subject: row.subject, profile: row.profile, expiresAt: row.expires_at } : null;
  }

  async revoke(tokenHash: string) {
    await this.database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  async createTransaction(transaction: AuthTransaction) {
    await this.database.prepare("DELETE FROM auth_transactions WHERE expires_at <= ?").bind(Date.now()).run();
    await this.database.prepare(
      "INSERT INTO auth_transactions (state_hash, browser_binding_hash, nonce, pkce_verifier, return_path, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      transaction.stateHash,
      transaction.browserBindingHash,
      transaction.nonce,
      transaction.pkceVerifier,
      transaction.returnPath,
      transaction.expiresAt,
    ).run();
  }

  async consumeTransaction(criteria: { readonly stateHash: string; readonly browserBindingHash: string; readonly now: number }) {
    // SQLite DELETE ... RETURNING makes matching, expiry enforcement, and one-use consumption atomic.
    const row = await this.database.prepare(
      "DELETE FROM auth_transactions WHERE state_hash = ? AND browser_binding_hash = ? AND expires_at > ? RETURNING state_hash, browser_binding_hash, nonce, pkce_verifier, return_path, expires_at",
    ).bind(criteria.stateHash, criteria.browserBindingHash, criteria.now).first<TransactionRow>();
    return row ? {
      stateHash: row.state_hash,
      browserBindingHash: row.browser_binding_hash,
      nonce: row.nonce,
      pkceVerifier: row.pkce_verifier,
      returnPath: row.return_path,
      expiresAt: row.expires_at,
    } : null;
  }
}
