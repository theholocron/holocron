import http from "node:http";
import url from "node:url";
import type { JWT, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import open from "open";
import destroyer from "server-destroy";
import { loadServiceAccountKey } from "./key.js";

function buildOAuth2Client(): OAuth2Client {
	const clientID = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	const redirectURI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/oauth2callback";

	if (!clientID || !clientSecret) {
		throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required for OAuth");
	}

	return new google.auth.OAuth2(clientID, clientSecret, redirectURI);
}

export const oauth = async (scopes: string[]): Promise<OAuth2Client | null> => {
	const oauth2Client = buildOAuth2Client();
	const port = parseInt(process.env.GOOGLE_REDIRECT_PORT ?? "4000", 10);

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
						server.destroy();
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
		destroyer(server);
	});
};

export async function googleAuth(scopes: string[]): Promise<JWT> {
	const auth = new google.auth.GoogleAuth({
		credentials: loadServiceAccountKey(),
		scopes,
	});

	return (await auth.getClient()) as JWT;
}
