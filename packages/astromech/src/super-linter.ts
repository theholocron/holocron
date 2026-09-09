/**
 * `superLinterConfig()` — turn the resolved linter set into the exact
 * super-linter `VALIDATE_*` / `FIX_*` env the CI `lint` job needs. The CLI
 * serializes {@link SuperLinterConfig.env} as the `super-linter-env` input
 * on each repo's generated `lint` thin caller; the reusable workflow
 * expands it verbatim. This is the CI half of "lint parity" — the local
 * half is the `holocron run lint` aggregate, driven by the same
 * {@link resolveLinters}.
 */

import { resolveLinters } from "./linters.js";

export interface SuperLinterConfig {
	/**
	 * Enabled `VALIDATE_*` / `FIX_*` keys → `"true"`. Only enabled keys are
	 * present (super-linter allow-list mode). Ready for `JSON.stringify`.
	 */
	env: Record<string, string>;
	/** Resolved linter names in execution order — for the human-readable comment. */
	linters: string[];
	/** Config-file inputs the resolved set honors (`eslint-config`, …). */
	configInputs: Partial<Record<"eslint-config" | "prettier-config" | "yaml-config", true>>;
}

/**
 * Resolve the super-linter env for a repo's `lint` task.
 *
 * @param opts.explicit  the task's `linters` list, if any (else auto-detect)
 * @param opts.rootFiles  repo-root filenames (from `listDir(cwd)`)
 * @param opts.includeFix  emit `FIX_*` keys too (default `true`)
 */
export function superLinterConfig(opts: {
	explicit?: string[];
	rootFiles: string[];
	includeFix?: boolean;
}): SuperLinterConfig {
	const includeFix = opts.includeFix ?? true;
	const resolved = resolveLinters({ explicit: opts.explicit, rootFiles: opts.rootFiles });

	const env: Record<string, string> = {};
	const configInputs: SuperLinterConfig["configInputs"] = {};

	for (const { def } of resolved) {
		for (const key of def.validate) env[key] = "true";
		if (includeFix) for (const key of def.fix ?? []) env[key] = "true";
		if (def.configInput) configInputs[def.configInput] = true;
	}

	return { env, linters: resolved.map((r) => r.name), configInputs };
}

/**
 * The always-on baseline env — every `always` linter, no detection. This is
 * what the reusable `lint.yml`'s `super-linter-env` input defaults to, so a
 * repo whose thin caller has not been re-synced yet behaves exactly as before.
 */
export function baselineSuperLinterEnv(): Record<string, string> {
	return superLinterConfig({ rootFiles: [] }).env;
}

/**
 * The `lint` thin caller's `with:` overrides + the `# linters: …` comment,
 * from the resolved linter set. Shared by `createAstromech().thinCallers()`
 * and the CLI's `sync` / `setup` workflow writers so the three stay in step.
 *
 * @param opts.explicit  the `lint` task's `linters` list, if any
 * @param opts.rootFiles  repo-root filenames (auto-detect fallback)
 * @param opts.extra  per-repo `with:` overrides that win over the defaults
 */
export function lintThinCallerWith(opts: { explicit?: string[]; rootFiles: string[]; extra?: Record<string, unknown> }): {
	withOverrides: Record<string, unknown>;
	comments: Record<string, string>;
} {
	const sl = superLinterConfig({ explicit: opts.explicit, rootFiles: opts.rootFiles });
	return {
		withOverrides: {
			"enable-auto-commit": true,
			"super-linter-env": JSON.stringify(sl.env),
			...(opts.extra ?? {}),
		},
		comments: { "super-linter-env": `linters: ${sl.linters.join(", ")}` },
	};
}
