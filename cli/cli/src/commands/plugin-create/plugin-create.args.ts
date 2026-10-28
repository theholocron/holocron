import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const pluginCreateArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("slug", { type: "string", describe: "Package slug (kebab-case)" })
		.positional("vendor", {
			type: "string",
			describe: "Vendor display name (PascalCase)",
		})
		.option("capability", {
			type: "string",
			describe:
				"Capability key: source|ci|secrets|environments|issues|deployment|storage|auth|vault|dns|tooling|notifications|analytics|errors|logs|wiki|workers",
		})
		.option("token-env", {
			type: "string",
			describe: "Holocron env var name (defaults to HOLOCRON_<VENDOR>_TOKEN)",
		})
		.option("vendor-env", {
			type: "string",
			describe: "Vendor-native env var name",
		})
		.option("base-url", {
			type: "string",
			describe: "REST base URL",
		})
		.option("verify", {
			type: "boolean",
			default: true,
			describe: "Run post-scaffold pnpm install + typecheck + lint + test (default true; --no-verify skips)",
		});

export type PluginCreateArgs = InferArgs<typeof pluginCreateArgs>;
