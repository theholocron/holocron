import type { Linter } from "eslint";
import eslintPackageJson from "eslint-package-json";

export function packageJson(): Linter.Config[] {
	return [
		{
			name: "@theholocron/package-json",
			...eslintPackageJson.configs.recommended,
			rules: {
				...eslintPackageJson.configs.recommended.rules,
				// pnpm catalog: specifiers (e.g. "catalog:configs") are not standard
				// semver ranges — this rule would flag every theholocron catalog entry.
				"package-json/dependency-version-range": "off",
				// workspace:* is intentional in peerDependencies for monorepo-internal
				// packages; pnpm rewrites these to real versions on publish.
				// Both rules are false positives for pnpm workspaces.
				"package-json/no-wildcard-dependencies": "off",
				"package-json/no-workspace-protocol-in-published-package": "off",
				// @eslint/json 2.x provides a JSON sourceCode object without
				// getAllComments(), causing this core rule to crash when linting
				// package.json files. JSON files have no comments to check anyway.
				"no-irregular-whitespace": "off",
				// eslint-plugin-n rules crash on JSON files: node-builtins checks
				// globalScope (absent in JSON context) and no-extraneous-require
				// tries to resolve tsconfig (irrelevant for JSON). Disabling here
				// is safe — these rules are meaningless for package.json files.
				"n/no-unsupported-features/node-builtins": "off",
				"n/no-extraneous-require": "off",
				// In a pnpm workspace, packages/* dirs are each the root of an
				// independently published package, not nested package.json files.
				// The rule has no workspace awareness and fires on every workspace
				// package that declares exports. The rule docs explicitly recommend
				// disabling for such manifests.
				"package-json/no-nested-exports": "off",
				// Canonical order matching sort-package-json's sortOrder so that the
				// pre-commit hook and this rule agree and never conflict.
				"package-json/sort-properties": [
					"error",
					{
						order: [
							"$schema",
							"name",
							"displayName",
							"version",
							"stableVersion",
							"private",
							"description",
							"categories",
							"keywords",
							"homepage",
							"bugs",
							"repository",
							"funding",
							"license",
							"qna",
							"author",
							"maintainers",
							"contributors",
							"publisher",
							"sideEffects",
							"type",
							"imports",
							"exports",
							"main",
							"svelte",
							"umd:main",
							"jsdelivr",
							"unpkg",
							"module",
							"source",
							"jsnext:main",
							"browser",
							"react-native",
							"types",
							"typesVersions",
							"typings",
							"style",
							"example",
							"examplestyle",
							"assets",
							"bin",
							"man",
							"directories",
							"files",
							"workspaces",
							"binary",
							"scripts",
							"betterScripts",
							"wireit",
							"l10n",
							"contributes",
							"activationEvents",
							"husky",
							"simple-git-hooks",
							"pre-commit",
							"commitlint",
							"lint-staged",
							"nano-staged",
							"config",
							"nodemonConfig",
							"browserify",
							"babel",
							"browserslist",
							"xo",
							"prettier",
							"eslintConfig",
							"eslintIgnore",
							"npmpkgjsonlint",
							"npmPackageJsonLintConfig",
							"npmpackagejsonlint",
							"release",
							"remarkConfig",
							"stylelint",
							"ava",
							"jest",
							"jest-junit",
							"jest-stare",
							"mocha",
							"nyc",
							"c8",
							"tap",
							"oclif",
							"resolutions",
							"overrides",
							"dependencies",
							"devDependencies",
							"dependenciesMeta",
							"peerDependencies",
							"peerDependenciesMeta",
							"optionalDependencies",
							"bundledDependencies",
							"bundleDependencies",
							"extensionPack",
							"extensionDependencies",
							"flat",
							"packageManager",
							"engines",
							"engineStrict",
							"devEngines",
							"volta",
							"languageName",
							"os",
							"cpu",
							"preferGlobal",
							"publishConfig",
							"icon",
							"badges",
							"galleryBanner",
							"preview",
							"markdown",
							"pnpm",
						],
					},
				],
			},
		},
	];
}
