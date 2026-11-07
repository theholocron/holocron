/**
 * What a GitHub App is right now, read with the App's own JWT (`GET /app`, `GET /app/installations`). GitHub has no
 * endpoint that changes an existing App's permissions or event subscriptions, so these reads are how a caller
 * checks the settings page was done by hand.
 *
 * https://docs.github.com/en/rest/apps/apps#get-the-authenticated-app
 * https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app
 */

import { ProviderApiError } from "@theholocron/http-client";

import { createAppJWT, type GitHubAppCredentials } from "../app-auth/app-auth.js";
import type { GitHubClientOptions } from "../utils.js";

/** The account an App or one of its installations belongs to. */
export interface GitHubAppAccount {
	/** The user or organization login. */
	login: string;
	/** `User` or `Organization` (GitHub also reports `Enterprise` for an enterprise-owned App). */
	type: string;
}

/** An App as `GET /app` reports it. */
export interface GitHubApp {
	/** The App's URL name, as in `github.com/apps/<slug>`. */
	slug: string;
	/** The App's display name. */
	name: string;
	/** Who owns the App: decides which settings page its permissions live on. */
	owner: GitHubAppAccount | null;
	/** The permissions the App asks for now: name to `read`, `write` or `admin`. */
	permissions: Record<string, string>;
	/** The webhook events the App is subscribed to now. */
	events: string[];
}

/** One installation of an App as `GET /app/installations` reports it. */
export interface GitHubAppInstallation {
	/** The installation id. */
	id: number;
	/** The account the App is installed on. */
	account: GitHubAppAccount | null;
	/** What this installation has accepted: it lags the App's own list until an owner accepts a new request. */
	permissions: Record<string, string>;
	/** The events delivered to this installation. */
	events: string[];
}

const PAGE_SIZE = 100;

type Raw = Record<string, unknown>;

const account = (value: unknown): GitHubAppAccount | null => {
	const { login, type } = (value ?? {}) as Raw;
	return typeof login === "string" ? { login, type: typeof type === "string" ? type : "" } : null;
};

async function appGet(
	creds: GitHubAppCredentials,
	path: string,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch">
): Promise<unknown> {
	const jwt = await createAppJWT(creds);
	const baseUrl = opts.baseUrl ?? "https://api.github.com";
	const fetchImpl = opts.fetch ?? globalThis.fetch;
	const res = await fetchImpl(`${baseUrl}${path}`, {
		headers: {
			authorization: `Bearer ${jwt}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
		},
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new ProviderApiError(`GitHub GET ${path} → ${res.status}`, res.status, body);
	}
	return res.json();
}

/** The App this JWT identifies: its slug, owner and the permissions and events it asks for now. */
export async function getApp(
	creds: GitHubAppCredentials,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch"> = {}
): Promise<GitHubApp> {
	const raw = (await appGet(creds, "/app", opts)) as Raw;
	return {
		slug: String(raw.slug),
		name: String(raw.name),
		owner: account(raw.owner),
		permissions: (raw.permissions as Record<string, string> | undefined) ?? {},
		events: (raw.events as string[] | undefined) ?? [],
	};
}

/** Every installation of the App this JWT identifies, with what each has accepted. Reads all pages. */
export async function listAppInstallations(
	creds: GitHubAppCredentials,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch"> = {}
): Promise<GitHubAppInstallation[]> {
	const installations: GitHubAppInstallation[] = [];
	for (let page = 1; ; page++) {
		const raws = (await appGet(creds, `/app/installations?per_page=${PAGE_SIZE}&page=${page}`, opts)) as Raw[];
		for (const raw of raws) {
			installations.push({
				id: Number(raw.id),
				account: account(raw.account),
				permissions: (raw.permissions as Record<string, string> | undefined) ?? {},
				events: (raw.events as string[] | undefined) ?? [],
			});
		}
		if (raws.length < PAGE_SIZE) return installations;
	}
}
