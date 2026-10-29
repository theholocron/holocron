import type { PackagesRegistry, ReadmeSections, RepoTemplateConfig } from "./generate-readme.type.js";

const SCRIPT_ORDER = [
	"build",
	"dev",
	"preview",
	"start",
	"docs:dev",
	"docs:build",
	"docs:preview",
	"lint",
	"test",
	"test:coverage",
	"test:storybook",
	"test:cypress",
	"typecheck",
	"audit",
] as const;

const SCRIPT_ALLOWLIST = new Set<string>(SCRIPT_ORDER);

export function generateReadme(config: RepoTemplateConfig): ReadmeSections {
	return {
		description: config.description,
		...(config.packages !== undefined && {
			packages: generatePackages(config.packages),
		}),
		...(config.installation !== undefined && {
			installation: generateInstallation(config.installation),
		}),
		development: generateDevelopment(config.scripts),
		releases: generateReleases(config.homepage),
	};
}

function generatePackages(packages: PackagesRegistry): string {
	const rows = Object.values(packages)
		.map((entry) => `| \`${entry.package}\` | [Docs](${entry.docsUrl}) | [npm](${entry.npmUrl}) |`)
		.join("\n");
	return `| Package | Docs | npm |\n|---|---|---|\n${rows}`;
}

function generateInstallation(packageName: string): string {
	return `\`\`\`sh\npnpm add ${packageName}\n\`\`\``;
}

function generateDevelopment(scripts: Record<string, string>): string {
	const rows = SCRIPT_ORDER.filter((name) => SCRIPT_ALLOWLIST.has(name) && name in scripts).map(
		(name) => `| \`pnpm ${name}\` | \`${scripts[name]}\` |`
	);
	return `| Script | Command |\n|---|---|\n${rows.join("\n")}`;
}

function generateReleases(homepage: string): string {
	const base = homepage.replace(/\/$/, "");
	return `Automated via [semantic-release](https://semantic-release.gitbook.io/semantic-release/).\nSee the [releases page](${base}/releases) and [CHANGELOG.md](./CHANGELOG.md).`;
}
