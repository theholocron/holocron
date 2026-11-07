import http from "node:http";
import url from "node:url";

import { type EnvLookup, holocronEnv } from "@theholocron/env-utils/lookup";
import type { JWT, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import open from "open";
import destroyer from "server-destroy";

import { loadServiceAccountKey } from "./key.js";

function buildOAuth2Client(env: EnvLookup): OAuth2Client {
	const clientID = env.get("GOOGLE_CLIENT_ID");
	const clientSecret = env.get("GOOGLE_CLIENT_SECRET");
	const redirectURI = env.get("GOOGLE_REDIRECT_URI") ?? "http://localhost:4000/oauth2callback";

	if (!clientID || !clientSecret) {
		throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required for OAuth");
	}

	return new google.auth.OAuth2(clientID, clientSecret, redirectURI);
}

/**
 * Signs in with Google OAuth: opens the consent page, waits on a local callback and resolves with the client holding the tokens.
 *
 * @param env - Where to read the GOOGLE_* variables from; defaults to the process environment.
 */
export const oauth = async (scopes: string[], env: EnvLookup = holocronEnv()): Promise<OAuth2Client | null> => {
	const oauth2Client = buildOAuth2Client(env);
	const port = parseInt(env.get("GOOGLE_REDIRECT_PORT") ?? "4000", 10);

	return new Promise((resolve, reject) => {
		const authorizeUrl = oauth2Client.generateAuthUrl({
			access_type: "offline",
			scope: scopes.join(" "),
		});

		const server = http
			.createServer(async (req, res) => {
				try {
					if (req.url && req.url.indexOf("/oauth2callback") > -1) {
						const qs = new url.URL(req.url, `http://localhost:${port}`).searchParams;
						res.end("Authentication successful! Please return to the console.");
						(server as unknown as { destroy(): void }).destroy();
						const { tokens } = await oauth2Client.getToken(qs.get("code") ?? "");
						oauth2Client.credentials = tokens;
						resolve(oauth2Client);
					}
				} catch (e) {
					reject(e);
				}
			})
			.listen(port, () => {
				open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
			});
		destroyer(server as unknown as Parameters<typeof destroyer>[0]);
	});
};

/**
 * Authenticates as the service account from `loadServiceAccountKey()` for the given scopes and resolves with its JWT client.
 *
 * @param env - Where to read the GOOGLE_* variables from; defaults to the process environment.
 */
export async function googleAuth(scopes: string[], env: EnvLookup = holocronEnv()): Promise<JWT> {
	const auth = new google.auth.GoogleAuth({
		credentials: loadServiceAccountKey(env),
		scopes,
	});

	// google-auth-library v10 widened getClient() to AnyAuthClient; for service
	// account credentials it always resolves to JWT at runtime.
	return (await auth.getClient()) as unknown as JWT;
}
