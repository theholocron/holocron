import type { defineConfig } from "@theholocron/semantic-release-config";

/** What `defineConfig()` from `@theholocron/semantic-release-config` accepts. */
export type DefineConfigOptions = NonNullable<Parameters<typeof defineConfig>[0]>;

export interface GroupReleaseOptions extends DefineConfigOptions {
	/**
	 * The version group: a folder of the repo (`clients`, `observability`, `cli`) that
	 * releases on its own. It prefixes the tags (`clients-v1.43.2`) and the release commit.
	 */
	group: string;
	/** Repo-relative folders whose commits release this group. Defaults to `[group]`. */
	paths?: readonly string[];
	/** The group's changelog. Defaults to `<group>/CHANGELOG.md`. */
	changelogFile?: string;
}
