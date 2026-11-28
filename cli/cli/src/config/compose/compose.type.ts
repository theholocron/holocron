import type { DocsConfig, HolocronConfig, RawProvidersConfig, RepoConfig } from "../config/index.js";

/** One entry of the `tasks` manifest: a task name or the object form. */
export type TaskEntry = NonNullable<HolocronConfig["tasks"]>[number];

/** A single composable capability fragment. */
export interface Capability {
	/** Unique identifier — used for deduplication and dependency resolution. */
	id: string;
	/** Other capability IDs that must be present in the same compose() call. */
	requires?: string[];
	/** Task entries contributed by this capability. Merged by name; last writer wins. */
	tasks?: TaskEntry[];
	/** Provider config. Shallow-merged at the top level; later capabilities override per-key. */
	providers?: RawProvidersConfig;
	/**
	 * Required status-check contexts **not** backed by a `required` task
	 * (codecov gates, `Storybook Publish`, …). Unioned across all capabilities
	 * onto the top-level `extraRequiredChecks`. Task-backed checks come from
	 * `{ required: true }` task entries via `astromech.requiredChecks()`.
	 */
	extraRequiredChecks?: string[];
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
	/** Task entries merged from every capability, by name. */
	tasks: TaskEntry[];
	/** Provider config merged from every capability. */
	providers: RawProvidersConfig;
	/** Repo config merged from every capability. */
	repo: Partial<Omit<RepoConfig, "name">>;
	/** Non-task required-check contexts, unioned across capabilities. */
	extraRequiredChecks: string[];
	/** Org name; the last capability that sets it wins. */
	org?: string;
	/** Org canonical domain; the last capability that sets it wins. */
	domain?: string;
	/** Docs site config; the last capability that sets it wins. */
	docs?: DocsConfig;
}
