import type {
	EnsureRelaySourceInput,
	EnsureRelaySourceResult,
	InspectRelaySourceInput,
	RelaySourceState,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, HookScope } from "@theholocron/github-client";

/** The events a webhook subscribes to when the layout names none: the one the Dependabot relay source carries. */
export const DEFAULT_RELAY_EVENTS = ["dependabot_alert"];

/** A repository name, `owner/name`, made of the characters GitHub allows. */
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** An organization login. */
const ORGANIZATION = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** The webhook's target: where it lives and how to say so. */
export type RelayTarget = { scope: HookScope; label: string } | { problem: string };

/**
 * Where a relay source's one webhook lives. A webhook has one URL, so a source covers one place, not a list: a single
 * repository (`scope: ["owner/name"]`, or the plugin's own repository when `scope` is absent) or an organization
 * (`options: { org: "name" }` with no `scope`). Both together, more than one repository and anything that is not
 * `owner/name` are a problem the caller reports, never a guess.
 */
export function relayTarget(input: InspectRelaySourceInput, defaultRepo: string): RelayTarget {
	const org = input.options?.org;
	if (org !== undefined) {
		if (typeof org !== "string" || !ORGANIZATION.test(org)) {
			return { problem: `relay source ${input.source}: \`options.org\` must be an organization login` };
		}
		if (input.scope !== undefined && input.scope.length > 0) {
			return {
				problem: `relay source ${input.source}: name a repository in \`scope\` or an organization in \`options.org\`, not both`,
			};
		}
		return { scope: { kind: "organization", org }, label: `organization ${org}` };
	}
	const scope = input.scope ?? [];
	if (scope.length > 1) {
		return {
			problem: `relay source ${input.source}: a webhook has one URL, so \`scope\` names one repository, not ${scope.length}; use \`options.org\` for an organization`,
		};
	}
	const repo = scope[0] ?? defaultRepo;
	if (!REPOSITORY.test(repo)) {
		return {
			problem: `relay source ${input.source}: \`scope\` must be one repository as \`owner/name\`${scope.length === 0 ? " (the plugin has no repository to default to)" : ""}`,
		};
	}
	return { scope: { kind: "repo", repo }, label: `repository ${repo}` };
}

/** Whether two event lists subscribe to the same events. */
function sameEvents(a: string[], b: string[]): boolean {
	return a.length === b.length && [...a].sort().every((event, i) => event === [...b].sort()[i]);
}

/** The sentence for a token GitHub refuses, which GitHub answers as a 403 or, for a hidden resource, a 404. */
function accessTodo(label: string, scope: HookScope): string {
	const need =
		scope.kind === "organization"
			? "Organization permission Webhooks: read and write (classic: admin:org_hook)"
			: "Repository permission Webhooks: read and write (classic: admin:repo_hook)";
	return `GitHub refused the webhook call for ${label}: the token needs ${need}, or add the webhook in the settings yourself and set the secret on the Worker`;
}

/**
 * Makes the GitHub webhook for a relay source (spec `tech-relay-sources`, issue #2531). The webhook is found by its
 * `config.url`; when absent it is made with the secret the caller offers (GitHub never returns it, so it is returned
 * only now), and an existing one has only its events and `active` flag brought in line. Nothing is deleted and an
 * adopted webhook keeps the secret the Worker has.
 */
export async function ensureRelaySource(
	client: GitHubClient,
	defaultRepo: string,
	input: EnsureRelaySourceInput
): Promise<EnsureRelaySourceResult> {
	const target = relayTarget(input, defaultRepo);
	if ("problem" in target) return { created: false, updated: [], todo: [target.problem] };
	const events = input.events && input.events.length > 0 ? input.events : DEFAULT_RELAY_EVENTS;
	try {
		const found = (await client.hooks.listHooks(target.scope)).find((hook) => hook.config.url === input.url);
		if (!found) {
			if (!input.secret) {
				return {
					created: false,
					updated: [],
					todo: [`no signing secret was offered for the ${target.label} webhook, so none was made`],
				};
			}
			await client.hooks.createHook(target.scope, { url: input.url, secret: input.secret, events });
			return { created: true, updated: [], secret: input.secret };
		}
		const updated: string[] = [];
		const patch: { events?: string[]; active?: boolean } = {};
		if (!sameEvents(found.events, events)) {
			patch.events = events;
			updated.push("events");
		}
		if (!found.active) {
			patch.active = true;
			updated.push("active");
		}
		if (updated.length > 0) await client.hooks.updateHook(target.scope, found.id, patch);
		return { created: false, updated };
	} catch (err) {
		if (err instanceof ProviderApiError && (err.status === 403 || err.status === 404)) {
			return { created: false, updated: [], todo: [accessTodo(target.label, target.scope)] };
		}
		throw err;
	}
}

/** Reads the webhook back without changing anything: whether it exists, is active and what it subscribes to. The secret is never readable. */
export async function inspectRelaySource(
	client: GitHubClient,
	defaultRepo: string,
	input: InspectRelaySourceInput
): Promise<RelaySourceState> {
	const target = relayTarget(input, defaultRepo);
	if ("problem" in target) throw new Error(target.problem);
	const found = (await client.hooks.listHooks(target.scope)).find((hook) => hook.config.url === input.url);
	if (!found) return { exists: false };
	return {
		exists: true,
		enabled: found.active,
		events: found.events,
		...(target.scope.kind === "repo" ? { scope: [target.scope.repo] } : {}),
	};
}
