import { ConfigError, type DocsConfig, type RawProvidersConfig, type RepoConfig } from "../config/index.js";
import type { Capability, ComposedPreset, TaskEntry } from "./compose.type.js";

function taskName(e: TaskEntry): string {
	return typeof e === "string" ? e : e.name;
}

/**
 * Merge any number of capability fragments into a single preset object that
 * spreads directly into `defineConfig()`.
 *
 * - Accepts individual capabilities or nested arrays (for bundle presets).
 * - Deduplicates by `id` — when the same ID appears more than once, the last
 *   occurrence wins. This lets callers override bundle defaults by listing an
 *   explicit capability after the bundle.
 * - Validates all `requires` at call time and throws `ConfigError` if any are
 *   unmet, listing every missing dependency in a single message.
 *
 * @example
 * // docs-only site — no typecheck
 * const preset = compose(node(), docs());
 *
 * // library with docs
 * const preset = compose(node(), typecheck(), docs());
 *
 * // nextjs() is a bundle that returns Capability[]
 * const preset = compose(node(), nextjs());
 */
export function compose(...args: (Capability | Capability[])[]): ComposedPreset {
	const flat = args.flat();

	// Deduplicate by id — last writer wins
	const byId = new Map<string, Capability>();
	for (const cap of flat) {
		byId.set(cap.id, cap);
	}
	const caps = [...byId.values()];

	// Validate dependencies — collect all missing at once
	const available = new Set(caps.map((c) => c.id));
	const errors: string[] = [];
	for (const cap of caps) {
		for (const req of cap.requires ?? []) {
			if (!available.has(req)) {
				errors.push(`"${cap.id}" requires "${req}"`);
			}
		}
	}
	if (errors.length > 0) {
		throw new ConfigError(`compose(): unmet dependencies — ${errors.join(", ")}`);
	}

	// Merge tasks — deduplicate by name, last writer wins
	const taskMap = new Map<string, TaskEntry>();
	for (const cap of caps) {
		for (const entry of cap.tasks ?? []) {
			taskMap.set(taskName(entry), entry);
		}
	}

	// Merge providers — shallow merge, later capabilities override per-key
	let providers: RawProvidersConfig = {};
	for (const cap of caps) {
		if (cap.providers) providers = { ...providers, ...cap.providers };
	}

	// Union extraRequiredChecks (preserve insertion order, deduplicate)
	const checksSeen = new Set<string>();
	const extraRequiredChecks: string[] = [];
	for (const cap of caps) {
		for (const check of cap.extraRequiredChecks ?? []) {
			if (!checksSeen.has(check)) {
				checksSeen.add(check);
				extraRequiredChecks.push(check);
			}
		}
	}

	// Merge repo — scalars last-wins; properties and variables Object.assign; topics/teams union
	let repo: Partial<Omit<RepoConfig, "name">> = {};
	for (const cap of caps) {
		if (!cap.repo) continue;
		const { properties, topics, teams, variables, secrets, ...scalars } = cap.repo;
		repo = { ...repo, ...scalars };
		if (properties) repo.properties = { ...repo.properties, ...properties };
		if (variables) {
			repo.variables = {
				...repo.variables,
				...variables,
				...(repo.variables?.repo || variables.repo
					? { repo: { ...repo.variables?.repo, ...variables.repo } }
					: {}),
				...(repo.variables?.org || variables.org ? { org: { ...repo.variables?.org, ...variables.org } } : {}),
			};
		}
		if (secrets) {
			// Names add up across presets: each list is a union, each environment's too.
			const union = (a: string[] | undefined, b: string[] | undefined) => [
				...new Set([...(a ?? []), ...(b ?? [])]),
			];
			const environments = { ...repo.secrets?.environments };
			for (const [env, names] of Object.entries(secrets.environments ?? {})) {
				environments[env] = union(environments[env], names);
			}
			repo.secrets = {
				...(repo.secrets?.repo || secrets.repo ? { repo: union(repo.secrets?.repo, secrets.repo) } : {}),
				...(repo.secrets?.org || secrets.org ? { org: union(repo.secrets?.org, secrets.org) } : {}),
				...(Object.keys(environments).length > 0 ? { environments } : {}),
			};
		}
		if (topics) {
			const merged = new Set([...(repo.topics ?? []), ...topics]);
			repo.topics = [...merged];
		}
		if (teams) {
			const teamMap = new Map((repo.teams ?? []).map((t) => [typeof t === "string" ? t : t.slug, t]));
			for (const t of teams) {
				teamMap.set(typeof t === "string" ? t : t.slug, t);
			}
			repo.teams = [...teamMap.values()];
		}
	}

	// org, domain, docs — last writer wins
	let org: string | undefined;
	let domain: string | undefined;
	let docs: DocsConfig | undefined;
	for (const cap of caps) {
		if (cap.org !== undefined) org = cap.org;
		if (cap.domain !== undefined) domain = cap.domain;
		if (cap.docs !== undefined) docs = cap.docs;
	}

	return {
		tasks: [...taskMap.values()],
		providers,
		repo,
		extraRequiredChecks,
		...(org !== undefined ? { org } : {}),
		...(domain !== undefined ? { domain } : {}),
		...(docs !== undefined ? { docs } : {}),
	};
}
