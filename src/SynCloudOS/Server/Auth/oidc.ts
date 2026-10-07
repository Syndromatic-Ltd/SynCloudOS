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

import * as oauth from "oauth4webapi";

export interface OidcClientOptions {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly fetch: typeof globalThis.fetch;
}

export class OidcClient {
  readonly #issuer: URL;
  readonly #client: oauth.Client;
  readonly #clientAuthentication: oauth.ClientAuth;
  readonly #transport: oauth.HttpRequestOptions<"GET"> & oauth.HttpRequestOptions<"POST", URLSearchParams>;
  #metadata?: Promise<oauth.AuthorizationServer>;

  constructor(options: OidcClientOptions) {
    this.#issuer = new URL(options.issuer);
    if (this.#issuer.protocol !== "https:") throw new TypeError("OIDC issuer must use HTTPS.");
    this.#client = { client_id: options.clientId, id_token_signed_response_alg: "RS256" };
    this.#clientAuthentication = options.clientSecret ? oauth.ClientSecretPost(options.clientSecret) : oauth.None();
    this.#transport = { [oauth.customFetch]: options.fetch };
  }

  async metadata() {
    this.#metadata ??= (async () => {
      const response = await oauth.discoveryRequest(this.#issuer, this.#transport);
      const metadata = await oauth.processDiscoveryResponse(this.#issuer, response);
      if (metadata.issuer !== this.#issuer.href.replace(/\/$/u, "")) throw new TypeError("OIDC discovery issuer mismatch.");
      if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.jwks_uri) throw new TypeError("OIDC discovery metadata is incomplete.");
      return metadata;
    })();
    try {
      return await this.#metadata;
    } catch (error) {
      this.#metadata = undefined;
      throw error;
    }
  }

  async authorizationUrl(parameters: {
    readonly redirectUri: string;
    readonly state: string;
    readonly nonce: string;
    readonly codeChallenge: string;
  }) {
    const metadata = await this.metadata();
    const url = new URL(metadata.authorization_endpoint!);
    url.search = new URLSearchParams({
      client_id: this.#client.client_id,
      redirect_uri: parameters.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: parameters.state,
      nonce: parameters.nonce,
      code_challenge: parameters.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url;
  }

  async exchange(callbackUrl: URL, transaction: { readonly state: string; readonly nonce: string; readonly pkceVerifier: string }, redirectUri: string) {
    const metadata = await this.metadata();
    const parameters = oauth.validateAuthResponse(metadata, this.#client, callbackUrl.searchParams, transaction.state);
    const response = await oauth.authorizationCodeGrantRequest(
      metadata,
      this.#client,
      this.#clientAuthentication,
      parameters,
      redirectUri,
      transaction.pkceVerifier,
      this.#transport,
    );
    const tokens = await oauth.processAuthorizationCodeResponse(metadata, this.#client, response, {
      expectedNonce: transaction.nonce,
      requireIdToken: true,
    });
    await oauth.validateApplicationLevelSignature(metadata, response, this.#transport);
    const claims = oauth.getValidatedIdTokenClaims(tokens);
    if (!claims?.iss || !claims.sub) throw new TypeError("OIDC ID token is missing subject claims.");
    return claims;
  }
}

export { calculatePKCECodeChallenge, generateRandomCodeVerifier, generateRandomNonce, generateRandomState } from "oauth4webapi";
