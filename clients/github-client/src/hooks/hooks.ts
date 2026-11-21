import type { RestClient } from "../utils.js";
import { segment } from "../utils.js";

/** Where a webhook lives: one repository (`owner/name`) or an organization. */
export type HookScope = { kind: "repo"; repo: string } | { kind: "organization"; org: string };

/** A webhook as GitHub returns it. The signing secret is never part of it (GitHub shows `********` or leaves it out). */
export interface GitHubHook {
	/** GitHub's id for the webhook. */
	id: number;
	/** Whether GitHub delivers to it. */
	active: boolean;
	/** The events it subscribes to (`dependabot_alert`, `push`, `*`). */
	events: string[];
	/** Where and how it delivers. */
	config: {
		/** The URL GitHub posts to. */
		url?: string;
		/** `json` or `form`. */
		content_type?: string;
	};
}

/** What makes a webhook. */
export interface CreateHookInput {
	/** Where GitHub posts. */
	url: string;
	/** The secret GitHub signs each delivery with (`X-Hub-Signature-256`). A credential. */
	secret: string;
	/** The events to subscribe to. */
	events: string[];
	/** Whether it delivers; default `true`. */
	active?: boolean;
}

/** What changes on an existing webhook: only these, so the URL and the secret are left as they are. */
export interface UpdateHookInput {
	/** The events to subscribe to. */
	events?: string[];
	/** Whether it delivers. */
	active?: boolean;
}

/** GitHub's largest page for this listing. */
const PAGE = 100;
/** A guard so a runaway listing cannot loop forever. */
const MAX_PAGES = 50;

function hooksPath(scope: HookScope): string {
	if (scope.kind === "organization") return `/orgs/${segment(scope.org)}/hooks`;
	const parts = scope.repo.split("/");
	if (parts.length !== 2 || parts.some((p) => p === "")) {
		throw new Error(`invalid repository: ${JSON.stringify(scope.repo)} (expected "owner/name")`);
	}
	return `/repos/${parts.map(segment).join("/")}/hooks`;
}

/** Webhooks of a repository or an organization (`/repos/{r}/hooks`, `/orgs/{o}/hooks`). */
export function hooks(rest: RestClient) {
	return {
		/** Every webhook in the scope, read page by page. */
		listHooks: async (scope: HookScope): Promise<GitHubHook[]> => {
			const path = hooksPath(scope);
			const all: GitHubHook[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const batch = await rest.request<GitHubHook[]>(path, {
					query: { per_page: String(PAGE), page: String(page) },
				});
				all.push(...batch);
				if (batch.length < PAGE) return all;
			}
			throw new Error(`more than ${MAX_PAGES * PAGE} webhooks in ${path}; refusing to read them all`);
		},

		/** Makes a JSON webhook that delivers to `url`, signed with `secret`. */
		createHook: (scope: HookScope, input: CreateHookInput): Promise<GitHubHook> =>
			rest.request<GitHubHook>(hooksPath(scope), {
				method: "POST",
				body: {
					name: "web",
					active: input.active ?? true,
					events: input.events,
					config: { url: input.url, content_type: "json", secret: input.secret, insecure_ssl: "0" },
				},
			}),

		/** Changes a webhook's events or `active` flag; the `config` (URL and secret) is not sent, so it stays. */
		updateHook: (scope: HookScope, id: number, input: UpdateHookInput): Promise<GitHubHook> =>
			rest.request<GitHubHook>(`${hooksPath(scope)}/${segment(String(id))}`, {
				method: "PATCH",
				body: {
					...(input.events !== undefined ? { events: input.events } : {}),
					...(input.active !== undefined ? { active: input.active } : {}),
				},
			}),
	};
}
