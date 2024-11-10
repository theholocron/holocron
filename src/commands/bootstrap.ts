import * as fs from "node:fs";
import * as path from "node:path";
import * as str from "@theholocron/utils-string";
import { type CommandBuilder } from "yargs";
import { type CLIOptions } from "@/cli";
import { HOME } from "@/const";
import { findReplace } from "@/tasks";
import { prompt } from "@/ui";
import { getDirectoryByLevel, log, node } from "@/utils";

function getRepoName(pathname) {
	const gitconfig = path.join(pathname, ".git", "config");

	try {
		const content = fs.readFileSync(gitconfig, "utf-8");
		const match = content.match(/url = .*\/(.*)\.git/); // Regex to capture repo name
		return match ? match[1] : null;
	} catch (error) {
		console.error("Error reading .git/config:", error);
		return null;
	}
}

interface BootstrapOpts extends CLIOptions {
	description?: string;
	name?: string;
}

interface BootstrapPositional extends CLIOptions {
	filepath?: string;
}

export const builder: CommandBuilder<BootstrapOpts, BootstrapPositional> = (yargs) =>
	yargs
		.options({
			description: {
				describe: "The description for the project",
				nargs: 1,
				requiresArg: true,
				type: "string",
			},
			name: {
				describe: "The name of the project",
				nargs: 1,
				requiresArg: true,
				type: "string",
			},
		})
		.positional("filepath", {
			describe: "The path to where the project is stored",
			type: "string",
		});
export const command: string = "bootstrap [filepath] [name] [description]";
export const desc: string = "Bootstrap a template";
export async function handler(options: CLIOptions): Promise<void> {
	const FN = "bootstrap";
	log.data(FN, "arguments", options, options);

	// search the home directory for projects
	// @TODO set this to check a configurable directory and default to HOME
	const projectPath = await prompt.search(options?.filepath, HOME, options);
	// from the project i need to determine if its has a package.json
	// and what type of template it is based on the name on the package.json
	// e.g. { name: "@theholocron/cli-template" }
	const [, pkg] = await node.pkg(projectPath);
	// template type, if any
	const type = getDirectoryByLevel(pkg.name, -1) ?? "react-template";

	const name =
		options?.name ??
		(await prompt.input("The name. What are we calling this thing?", true, {
			default: getRepoName(projectPath),
			transformer: str.toKebabCase,
		}));

	const description =
		options?.description ??
		(await prompt.input("A brief description. What does it do?", true, {
			transformer: str.toSentenceCase,
		}));

	const readme = `${projectPath}/README.md`;
	const pkgJson = `${projectPath}/package.json`;

	await findReplace([readme, `${projectPath}/tsconfig.json`], type, str.toTitleCase(name));
	await findReplace(
		[`${projectPath}/src/utils/config/config.ts`, pkgJson, `${projectPath}/vite.config.ts`],
		type,
		str.toKebabCase(name)
	);
	await findReplace([readme, pkgJson], "<description>", str.toSentenceCase(description));
	await findReplace([`${projectPath}/.changeset/config.json`], type, name);

	if (type === "cli-template") {
		await findReplace(
			[`${projectPath}/src/cli.ts`, `${projectPath}/.env`],
			"CLI_TEMPLATE",
			str.toConstantCase(name)
		);
	}

	process.exit(0);
}
