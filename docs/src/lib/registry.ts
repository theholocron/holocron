/**
 * Links to the packages the Holocron docs site documents, derived from the
 * workspace instead of a hand-kept list: each entry comes from a package.json in
 * the repo, so a new plugin shows up here by existing.
 */

export type LinkEntry = {
	slug: string;
	package: string;
	docsUrl: string;
	npmUrl: string;
	githubUrl: string;
};

export type LinksRegistry = Record<string, LinkEntry>;

const DOCS = "https://docs.theholocron.dev/holocron";
const GITHUB = "https://github.com/theholocron/holocron";
const NPM = "https://www.npmjs.com/package";

/** The page that documents each tool, where it is not simply `<slug>`. */
const TOOL_PAGES: Record<string, string> = {
	cli: "cli",
	astromech: "astromech",
	datapad: "datapad",
	sentinel: "sentinel",
};

const manifests = import.meta.glob<{ name: string }>(
	[
		"../../../plugins/*/package.json",
		"../../../cli/{cli,astromech,datapad}/package.json",
		"../../../apps/sentinel/package.json",
	],
	{ eager: true, import: "default" }
);

function entry(name: string, docsPath: string): LinkEntry {
	return {
		slug: name.split("/").at(-1)!,
		package: name,
		docsUrl: `${DOCS}/${docsPath}`,
		npmUrl: `${NPM}/${name}`,
		githubUrl: GITHUB,
	};
}

function build(isPlugin: boolean): LinksRegistry {
	const out: LinksRegistry = {};
	for (const { name } of Object.values(manifests)) {
		const slug = name.split("/").at(-1)!;
		if (slug.startsWith("holocron-plugin-") !== isPlugin) continue;
		out[slug] = entry(
			name,
			isPlugin ? `plugins/${slug.replace("holocron-plugin-", "")}` : (TOOL_PAGES[slug] ?? slug)
		);
	}
	return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export const getPlugins = (): LinksRegistry => build(true);

/** The CLI, its tools and its plugins: what the home page lists. */
export const getHolocron = (): LinksRegistry => ({ ...build(false), ...build(true) });
