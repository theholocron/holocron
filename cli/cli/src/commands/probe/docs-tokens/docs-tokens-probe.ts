import type { Probe, ProbeContext } from "../../../plugin/index.js";
import { comparePermissions } from "./compare-permissions/index.js";
import type { DocsTokensIo } from "./docs-tokens.type.js";
import { permissionTables } from "./permission-tables/index.js";

const KEYS = ["envName", "vendorEnvName", "keyringService", "keyringKey"] as const;

/** The plugins that have several credentials, each with its own table, so any row of the page counts. */
const OWN_TABLES = new Set(["holocron-plugin-discord", "holocron-plugin-github"]);

/** Fewer plugin resolvers than this means the search found the wrong place, not that the docs are complete. */
const MIN_RESOLVERS = 10;

/** Every `key: "value"` string a source declares for one of the given token resolver settings. */
function declared(text: string, keys: readonly string[]): string[] {
	return keys.flatMap((key) =>
		[...text.matchAll(new RegExp(`\\b${key}:\\s*"([^"]+)"`, "g"))].map((match) => match[1]!)
	);
}

/**
 * `docs tokens`: fails for each token a plugin's resolver reads (`envName`, `vendorEnvName`, `keyringService`,
 * `keyringKey` in `plugins/<name>/src/auth.ts`) that `docs/src/content/docs/tokens.mdx` does not document. The Discord
 * and GitHub plugins have their own tables, so any row of the page counts; every other plugin has one row in the
 * provider table and its names must be in that row. A plugin that resolves nothing (1Password uses the `op` CLI's own
 * auth) needs no row. The one resolver the setup command builds itself is checked against the whole page. A token that
 * declares permissions per layer (`PluginToken.expect`, #2150) is also compared with its permission table, a table with
 * an `Id` column and a column per layer (`required` or `absent`): a permission, layer or rule that differs fails, naming
 * the token, layer and permission. A plugin whose declaration cannot be loaded (not built) is an `info` row. It runs in
 * the `validate:docs` task, through `docs validate`.
 */
export function docsTokensProbe(io: DocsTokensIo): Probe {
	return {
		summary: "Fail for each token a plugin resolves that docs/src/content/docs/tokens.mdx does not document.",
		writes: false,
		async run(ctx: ProbeContext) {
			const page = io.page();
			const files = io.authFiles();
			const rowFor = (plugin: string): string | undefined =>
				page.split("\n").find((line) => line.startsWith(`| \`${plugin.replace("holocron-plugin-", "")}\``));

			ctx.say({ status: "heading", label: "Documented tokens" });
			if (files.length <= MIN_RESOLVERS) {
				ctx.say({
					status: "fail",
					label: "plugin resolvers",
					detail: `found ${files.length}, expected more than ${MIN_RESOLVERS}: is the search looking in the right place?`,
				});
			}
			for (const { plugin, text } of files) {
				const names = declared(text, KEYS);
				const row = OWN_TABLES.has(plugin) ? page : rowFor(plugin);
				// A plugin with nothing to resolve has no row to check.
				if (names.length > 0 && row === undefined) {
					ctx.say({ status: "fail", label: plugin, detail: "no provider-table row in tokens.mdx" });
					continue;
				}
				const missing = names.filter((name) => !row?.includes(`\`${name}\``));
				if (missing.length > 0) {
					ctx.say({ status: "fail", label: plugin, detail: `not in tokens.mdx: ${missing.join(", ")}` });
				} else {
					ctx.say({ status: "ok", label: plugin, detail: `${names.length} documented` });
				}
			}

			const setupNames = declared(io.setupSource(), ["envName", "keyringKey"]);
			const setupMissing = setupNames.filter((name) => !page.includes(`\`${name}\``));
			if (setupMissing.length > 0) {
				ctx.say({ status: "fail", label: "setup", detail: `not in tokens.mdx: ${setupMissing.join(", ")}` });
			} else {
				ctx.say({ status: "ok", label: "setup", detail: `${setupNames.length} documented` });
			}

			ctx.say({ status: "heading", label: "Documented permissions" });
			const tables = permissionTables(page);
			for (const { plugin, tokens, error } of await io.declarations()) {
				if (error !== undefined) {
					ctx.say({ status: "info", label: plugin, detail: `declaration not loaded: ${error}` });
					continue;
				}
				const problems = comparePermissions(tokens, tables, plugin.replace("holocron-plugin-", ""));
				for (const { envName, layer, permission, detail } of problems) {
					const where = [envName, layer, permission].filter((part) => part !== "").join(" ");
					ctx.say({ status: "fail", label: where, detail });
				}
				if (problems.length === 0 && tokens.some((token) => token.expect?.permissions)) {
					ctx.say({ status: "ok", label: plugin, detail: "permissions match tokens.mdx" });
				}
			}
		},
	};
}
