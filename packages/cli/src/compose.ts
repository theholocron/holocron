import { ConfigError } from "./config.js";
import type { DocsConfig, HolocronConfig, RawProvidersConfig, RepoConfig } from "./config.js";

type WorkflowEntry = NonNullable<HolocronConfig["workflows"]>[number];

/** A single composable capability fragment. */
export interface Capability {
	/** Unique identifier — used for deduplication and dependency resolution. */
	id: string;
	/** Other capability IDs that must be present in the same compose() call. */
	requires?: string[];
	/** Workflow entries contributed by this capability. Merged by name; last writer wins. */
	workflows?: WorkflowEntry[];
	/** Provider config. Shallow-merged at the top level; later capabilities override per-key. */
	providers?: RawProvidersConfig;
	/** CI check names that must pass. Unioned across all capabilities. */
	requiredChecks?: string[];
	/** Repo config fragment. Scalar fields: last writer wins. properties/topics/teams: merged. */
	repo?: Partial<Omit<RepoConfig, "name">>;
	/** Org name. Last writer wins. */
	org?: string;
	/** Org canonical domain. Last writer wins. */
	domain?: string;
	/** Docs site config. Last writer wins. */
	docs?: DocsConfig;
}

/** The merged result of a compose() call. Spreads into defineConfig(). */
export interface ComposedPreset {
	workflows: WorkflowEntry[];
	providers: RawProvidersConfig;
	repo: Partial<Omit<RepoConfig, "name">> & { requiredChecks: string[] };
	org?: string;
	domain?: string;
	docs?: DocsConfig;
}

function workflowName(e: WorkflowEntry): string {
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

	// Merge workflows — deduplicate by name, last writer wins
	const workflowMap = new Map<string, WorkflowEntry>();
	for (const cap of caps) {
		for (const entry of cap.workflows ?? []) {
			workflowMap.set(workflowName(entry), entry);
		}
	}

	// Merge providers — shallow merge, later capabilities override per-key
	let providers: RawProvidersConfig = {};
	for (const cap of caps) {
		if (cap.providers) providers = { ...providers, ...cap.providers };
	}

	// Union requiredChecks (preserve insertion order, deduplicate)
	const checksSeen = new Set<string>();
	const requiredChecks: string[] = [];
	for (const cap of caps) {
		for (const check of cap.requiredChecks ?? []) {
			if (!checksSeen.has(check)) {
				checksSeen.add(check);
				requiredChecks.push(check);
			}
		}
	}

	// Merge repo — scalars last-wins; properties Object.assign; topics/teams union
	let repo: Partial<Omit<RepoConfig, "name">> = {};
	for (const cap of caps) {
		if (!cap.repo) continue;
		const { properties, topics, teams, ...scalars } = cap.repo;
		repo = { ...repo, ...scalars };
		if (properties) repo.properties = { ...repo.properties, ...properties };
		if (topics) {
			const merged = new Set([...(repo.topics ?? []), ...topics]);
			repo.topics = [...merged];
		}
		if (teams) {
			const teamMap = new Map(
				(repo.teams ?? []).map((t) => [typeof t === "string" ? t : t.slug, t])
			);
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
		workflows: [...workflowMap.values()],
		providers,
		repo: { ...repo, requiredChecks },
		...(org !== undefined ? { org } : {}),
		...(domain !== undefined ? { domain } : {}),
		...(docs !== undefined ? { docs } : {}),
	};
}
