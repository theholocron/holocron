import { defaultImporter, isModuleNotFound } from "@theholocron/kyber/plugins";

import type { PluginImporter } from "../loader/loader.type.js";

/**
 * The line that says how to get a plugin package that does not resolve: add it to the `holocron` catalog of
 * `pnpm-workspace.yaml` (beside `@theholocron/holocron-plugin-github`, same version) and to the repo's
 * `devDependencies` as `catalog:holocron`, then install.
 */
export function missingPluginHint(packageName: string): string {
	return (
		`To add it: list \`${packageName}\` under \`catalogs.holocron\` in pnpm-workspace.yaml (the version of ` +
		`\`@theholocron/holocron-plugin-github\`), add \`"${packageName}": "catalog:holocron"\` to devDependencies, ` +
		`then run \`pnpm install\`.`
	);
}

/**
 * An importer that behaves as `base` and, when the package itself is not installed, appends {@link missingPluginHint}
 * to the error. The original text stays first, so the loader's check for a missing package still recognises it.
 */
export function hintingImporter(base: PluginImporter = defaultImporter): PluginImporter {
	return async (packageName) => {
		try {
			return await base(packageName);
		} catch (err) {
			if (err instanceof Error && isModuleNotFound(err) && err.message.includes(packageName)) {
				err.message = `${err.message}\n${missingPluginHint(packageName)}`;
			}
			throw err;
		}
	};
}
