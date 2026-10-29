import type { ComposedPreset } from "../../config/compose/index.js";

/**
 * Wraps any composed preset with monorepo-specific overrides
 * (sets uses_external_packages: true).
 *
 * For new configs, prefer: compose(node(), typecheck(), ..., monorepo())
 *
 * @example
 * const preset = monorepo(nextjs());
 */
export function monorepoPreset(base: ComposedPreset): ComposedPreset {
	return {
		...base,
		repo: {
			...base.repo,
			properties: { ...base.repo.properties, uses_external_packages: true },
		},
	};
}
