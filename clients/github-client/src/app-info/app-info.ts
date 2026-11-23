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

async function appFetch(
	creds: GitHubAppCredentials,
	path: string,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch">,
	method: "GET" | "POST" = "GET"
): Promise<Response> {
	const jwt = await createAppJWT(creds);
	const baseUrl = opts.baseUrl ?? "https://api.github.com";
	const fetchImpl = opts.fetch ?? globalThis.fetch;
	const res = await fetchImpl(`${baseUrl}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${jwt}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
		},
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new ProviderApiError(`GitHub ${method} ${path} → ${res.status}`, res.status, body);
	}
	return res;
}

async function appGet(
	creds: GitHubAppCredentials,
	path: string,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch">
): Promise<unknown> {
	return (await appFetch(creds, path, opts)).json();
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

/** One delivery of a webhook event to the App, as `GET /app/hook/deliveries` reports it. */
export interface GitHubAppDelivery {
	/** The delivery's id, which a redelivery is asked for by. */
	id: number;
	/** The delivery's GUID, shared by the first attempt and every redelivery of it (`X-GitHub-Delivery`). */
	guid: string;
	/** When it was delivered, an ISO time. */
	deliveredAt: string;
	/** Whether this attempt was itself a redelivery. */
	redelivery: boolean;
	/** The HTTP status the App's endpoint answered, or `0` when it gave none (a timeout, a refused connection). */
	statusCode: number;
	/** GitHub's own word for the outcome: `OK`, or the failure (`Invalid HTTP Response: 500`, `Timed out`). */
	status: string;
	/** The event, such as `check_run`. */
	event: string;
	/** The event's action, `null` for an event with none. */
	action: string | null;
	/** The installation it was for, `null` when it was for none. */
	installationId: number | null;
}

/** What {@link listAppDeliveries} reads. */
export interface ListAppDeliveriesOptions extends Pick<GitHubClientOptions, "baseUrl" | "fetch"> {
	/** Stop at deliveries older than this ISO time. Without it, every page up to `maxPages` is read. */
	since?: string;
	/** The most pages to read, 100 deliveries each; defaults to 10, so 1,000 deliveries. */
	maxPages?: number;
}

const DELIVERY_PAGES = 10;

/** The `cursor` of the `rel="next"` link of a `Link` header, `undefined` when there is none. */
function nextCursor(link: string | null): string | undefined {
	const next = link?.split(",").find((part) => part.includes('rel="next"'));
	return /[?&]cursor=([^&>]+)/.exec(next ?? "")?.[1];
}

/**
 * The webhook deliveries of the App this JWT identifies, newest first (`GET /app/hook/deliveries`), a page at a time by
 * the cursor GitHub hands back, until a delivery older than `since`, the last page, or `maxPages`. A delivery older than
 * `since` is left out. Needs no repository permission: the App's own JWT is the credential.
 */
export async function listAppDeliveries(
	creds: GitHubAppCredentials,
	opts: ListAppDeliveriesOptions = {}
): Promise<GitHubAppDelivery[]> {
	const deliveries: GitHubAppDelivery[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < (opts.maxPages ?? DELIVERY_PAGES); page++) {
		const path = `/app/hook/deliveries?per_page=${PAGE_SIZE}${cursor === undefined ? "" : `&cursor=${cursor}`}`;
		const res = await appFetch(creds, path, opts);
		const raws = (await res.json()) as Raw[];
		for (const raw of raws) {
			deliveries.push({
				id: Number(raw.id),
				guid: String(raw.guid),
				deliveredAt: String(raw.delivered_at),
				redelivery: raw.redelivery === true,
				statusCode: Number(raw.status_code ?? 0),
				status: String(raw.status ?? ""),
				event: String(raw.event),
				action: typeof raw.action === "string" ? raw.action : null,
				installationId: typeof raw.installation_id === "number" ? raw.installation_id : null,
			});
		}
		cursor = nextCursor(res.headers.get("link"));
		const oldest = deliveries.at(-1);
		if (
			cursor === undefined ||
			(opts.since !== undefined && oldest !== undefined && oldest.deliveredAt < opts.since)
		) {
			break;
		}
	}
	return opts.since === undefined ? deliveries : deliveries.filter((delivery) => delivery.deliveredAt >= opts.since!);
}

/**
 * Asks GitHub to deliver one webhook delivery again (`POST /app/hook/deliveries/{id}/attempts`). GitHub answers 202 and
 * sends it asynchronously, so this says only that it was accepted.
 */
export async function redeliverAppDelivery(
	creds: GitHubAppCredentials,
	deliveryId: number,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch"> = {}
): Promise<void> {
	await appFetch(creds, `/app/hook/deliveries/${deliveryId}/attempts`, opts, "POST");
}
