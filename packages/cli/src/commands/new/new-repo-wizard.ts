import { input, select } from "@inquirer/prompts";

import { parseTopics, validateRepoName } from "./index.js";
import type { NewRepoArgs } from "./new-repo.args.js";

/** The prompts the wizard asks with: `@inquirer/prompts`, or stand-ins in a test. */
export interface WizardPrompts {
	input: typeof input;
	select: typeof select;
}

export interface NewRepoAnswers {
	type: string | undefined;
	name: string | undefined;
	description: string | undefined;
	homepage: string | undefined;
	vaultProvider: string | undefined;
	vaultProject: string | undefined;
	vaultConfig: string | undefined;
	deploymentProvider: string | undefined;
	agent: string | undefined;
	runtimeEnvironment: string | undefined;
	topics: string[];
	protection: string | undefined;
	openSource: boolean | undefined;
	usesExternalPackages: boolean | undefined;
	skills: string[];
	isTemplate: boolean | undefined;
}

/** `holocron new repo`'s interactive wizard: asks for every field not already supplied as an argument. */
export async function askNewRepoAnswers(
	argv: Pick<
		NewRepoArgs,
		| "type"
		| "name"
		| "description"
		| "homepage"
		| "vault"
		| "deployment"
		| "agent"
		| "runtime-environment"
		| "topics"
		| "protection"
		| "open-source"
		| "uses-external-packages"
		| "skills"
		| "is-template"
	>,
	prompts: WizardPrompts = { input, select }
): Promise<NewRepoAnswers> {
	const { input: ask, select: choose } = prompts;
	let type = argv.type as string | undefined;
	let name = argv.name as string | undefined;
	let description = argv.description as string | undefined;
	let homepage = argv.homepage as string | undefined;
	let vaultProvider = argv.vault as string | undefined;
	let vaultProject: string | undefined;
	let vaultConfig: string | undefined;
	let deploymentProvider = argv.deployment as string | undefined;
	let agent = argv.agent as string | undefined;
	let runtimeEnvironment = argv["runtime-environment"] as string | undefined;
	let topics: string[] = parseTopics(argv.topics as string | undefined);
	let protection = argv.protection as string | undefined;
	let openSource = argv["open-source"] as boolean | undefined;
	let usesExternalPackages = argv["uses-external-packages"] as boolean | undefined;
	let skills: string[] = parseTopics(argv.skills as string | undefined);
	const isTemplate = argv["is-template"] as boolean | undefined;

	// Interactive wizard — skip any field already supplied as a CLI arg
	if (!type) {
		type = await choose({
			message: "Template type:",
			choices: [
				{ name: "node    — Node.js library or tool", value: "node" },
				{
					name: "cli     — CLI application (inquirer, chalk, yargs)",
					value: "cli",
				},
				{ name: "monorepo — Turbo monorepo", value: "monorepo" },
				{ name: "react   — React component library", value: "react" },
				{ name: "nextjs  — Next.js application", value: "nextjs" },
				{ name: "base    — Minimal repo (no package.json)", value: "base" },
			],
		});
	}

	if (!name) {
		name = await ask({
			message: "Repo name (kebab-case):",
			validate: validateRepoName,
		});
		name = name.trim();
	}

	if (description === undefined) {
		description = await ask({ message: "Short description:" });
	}

	if (homepage === undefined) {
		const raw = await ask({ message: "Homepage URL (optional, Enter to skip):" });
		homepage = raw.trim() || undefined;
	}

	if (!runtimeEnvironment) {
		runtimeEnvironment = await choose({
			message: "Runtime environment:",
			choices: [
				{ name: "node      — Node.js process", value: "node" },
				{ name: "browser   — Browser only", value: "browser" },
				{ name: "universal — Node.js + browser", value: "universal" },
				{ name: "none      — No runtime (docs, config, etc.)", value: "none" },
			],
			default: type === "base" ? "none" : "node",
		});
	}

	if (!vaultProvider) {
		vaultProvider = await choose({
			message: "Vault provider:",
			choices: [
				{ name: "None", value: "none" },
				{ name: "Doppler", value: "doppler" },
				{ name: "1Password", value: "1password" },
				{ name: "Infisical", value: "infisical" },
			],
		});
	}

	if (vaultProvider === "doppler") {
		vaultProject = await ask({ message: "Doppler project name:", default: name });
		vaultConfig = await ask({ message: "Doppler config:", default: "dev" });
	} else if (vaultProvider === "1password" || vaultProvider === "infisical") {
		vaultProject = await ask({
			message: `${vaultProvider === "1password" ? "1Password vault" : "Infisical project"} name:`,
			default: name,
		});
	}

	if (!deploymentProvider) {
		deploymentProvider = await choose({
			message: "Deployment provider:",
			choices: [
				{ name: "None", value: "none" },
				{ name: "Vercel", value: "vercel" },
			],
		});
	}

	if (!agent) {
		agent = await choose({
			message: "AI agent:",
			choices: [
				{ name: "Claude", value: "claude" },
				{ name: "None", value: "none" },
			],
		});
	}

	if (topics.length === 0) {
		const raw = await ask({ message: "Topics (comma-separated, optional):" });
		topics = parseTopics(raw);
	}

	if (!protection) {
		protection = await choose({
			message: "Branch protection:",
			choices: [
				{ name: "strict    — required reviews + passing checks", value: "strict" },
				{
					name: "balanced  — required reviews, flexible checks",
					value: "balanced",
				},
				{ name: "minimal   — branch protection only", value: "minimal" },
			],
		});
	}

	if (openSource === undefined) {
		const ans = await choose({
			message: "Open source?",
			choices: [
				{ name: "Yes", value: "yes" },
				{ name: "No", value: "no" },
			],
		});
		openSource = ans === "yes";
	}

	if (usesExternalPackages === undefined) {
		const ans = await choose({
			message: "Uses external APIs or services?",
			choices: [
				{ name: "Yes", value: "yes" },
				{ name: "No", value: "no" },
			],
		});
		usesExternalPackages = ans === "yes";
	}

	if (skills.length === 0) {
		const raw = await ask({ message: "Agent skills (comma-separated, optional):" });
		skills = parseTopics(raw);
	}

	return {
		type,
		name,
		description,
		homepage,
		vaultProvider,
		vaultProject,
		vaultConfig,
		deploymentProvider,
		agent,
		runtimeEnvironment,
		topics,
		protection,
		openSource,
		usesExternalPackages,
		skills,
		isTemplate,
	};
}
