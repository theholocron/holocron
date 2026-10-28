import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const newRepoArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("type", {
			type: "string",
			describe:
				"Template type — maps to theholocron/<type>-template " +
				"(e.g. cli, react, nextjs, node, monorepo, base)",
		})
		.positional("name", {
			type: "string",
			describe: "New repo name (kebab-case, e.g. my-tool)",
		})
		.option("description", {
			type: "string",
			describe: "Short description — replaces <description> placeholders in the template",
		})
		.option("homepage", {
			type: "string",
			describe: "Homepage URL — replaces <homepage> placeholders and appears in holocron.config.ts",
		})
		.option("vault", {
			type: "string",
			describe: "Vault provider: none, doppler, 1password, infisical",
		})
		.option("deployment", {
			type: "string",
			describe: "Deployment provider: none, vercel",
		})
		.option("agent", {
			type: "string",
			describe: "AI agent: claude, none",
		})
		.option("runtime-environment", {
			type: "string",
			describe: "Runtime environment: node, browser, universal, none",
		})
		.option("topics", {
			type: "string",
			describe: "Comma-separated repo topics (e.g. typescript,nodejs)",
		})
		.option("protection", {
			type: "string",
			describe: "Branch protection level: strict, balanced, minimal",
		})
		.option("open-source", {
			type: "boolean",
			describe: "Whether the repo is open source (default: true)",
		})
		.option("uses-external-packages", {
			type: "boolean",
			describe: "Whether the repo calls external APIs or services (default: true)",
		})
		.option("skills", {
			type: "string",
			describe: "Comma-separated agent skill names (e.g. git-safety,pr-workflow)",
		})
		.option("is-template", {
			type: "boolean",
			describe: "Mark the new repo as a GitHub template repository",
		})
		.option("org", {
			type: "string",
			default: "theholocron",
			describe: "GitHub org that owns the template and will own the new repo",
		})
		.option("verify", {
			type: "boolean",
			default: true,
			describe: "Run pnpm install + holocron repo setup after bootstrapping (--no-verify skips)",
		});

export type NewRepoArgs = InferArgs<typeof newRepoArgs>;
