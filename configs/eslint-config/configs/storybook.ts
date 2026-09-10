import storybook from "eslint-plugin-storybook";
import type { Linter } from "eslint";

export function storybookConfig(): Linter.FlatConfig[] {
	return [
		...(storybook.configs["flat/recommended"] as unknown as Linter.FlatConfig[]),
		{
			name: "@theholocron/storybook-overrides",
			files: ["**/.storybook/**", "**/*.stories.@(js|jsx|mjs|ts|tsx)"],
			rules: {
				// `no-uninstalled-addons` resolves `.storybook/main`'s addon list
				// against a package.json it locates from the linter's cwd. In a
				// pnpm workspace `eslint .` runs per package, so the rule builds a
				// doubled path (`packages/x/packages/x/package.json`) and throws
				// instead of reporting — crashing `pnpm lint` entirely.
				// theholocron/configs#449
				"storybook/no-uninstalled-addons": "off",
			},
		},
	];
}

export { storybookConfig as storybook };
