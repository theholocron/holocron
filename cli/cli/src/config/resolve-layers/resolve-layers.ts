import { layerEnvironment, repoSlug } from "../../credentials-environments/index.js";
import type { EnvironmentLayer } from "../../credentials-environments/layer-environment/index.js";
import type { ResolvedHolocronConfig } from "../config/index.js";
import type { ResolveLayersInput } from "./resolve-layers.type.js";

/** An entry that names its Environment as either a literal `environment` or a `layer`. */
interface Layered {
	environment?: string;
	layer?: EnvironmentLayer;
}

/**
 * Turns every `layer` in a loaded config into the `environment` it names (spec `tech-environment-layers`, #2069), so
 * the commands and doctors that read Environments see one literal name and none of them derives it again. The name is
 * `layerEnvironment()` over the `origin` remote of `input.repoRoot`, read at most once and only when an entry names a
 * layer. A remote that cannot be read is a `ConfigError` naming the `environment` option (`repoSlug()`); nothing is
 * guessed. Covers `repo.secrets.sync`, `repo.secrets.deploy`, `repo.variables.sync`, `githubApps`, `dev` and the
 * `vault` provider's `layer` option. Returns a new config; the one passed in is not changed.
 *
 * @param config - The resolved config, validated by `resolveConfig()`.
 * @param input - Where to read the remote, and how.
 * @returns The config with each `layer` replaced by its `environment`.
 */
export async function resolveLayers(
	config: ResolvedHolocronConfig,
	input: ResolveLayersInput
): Promise<ResolvedHolocronConfig> {
	let slug: Promise<string> | undefined;
	const named = async <T extends Layered>(entry: T): Promise<T> => {
		if (entry.layer === undefined) return entry;
		const { layer, ...rest } = entry;
		slug ??= repoSlug(input.repoRoot, input.gitExec);
		return { ...rest, environment: layerEnvironment(await slug, layer) } as T;
	};
	const all = <T extends Layered>(list: T[]): Promise<T[]> => Promise.all(list.map(named));

	const out: ResolvedHolocronConfig = { ...config };
	const { repo } = config;
	if (repo) {
		const next = { ...repo };
		if (repo.secrets) {
			next.secrets = { ...repo.secrets };
			if (repo.secrets.sync) next.secrets.sync = await all(repo.secrets.sync);
			if (repo.secrets.deploy) next.secrets.deploy = await all(repo.secrets.deploy);
		}
		if (repo.variables?.sync) next.variables = { ...repo.variables, sync: await all(repo.variables.sync) };
		out.repo = next;
	}
	if (config.githubApps) out.githubApps = await all(config.githubApps);
	if (config.dev) out.dev = await named(config.dev);

	const vault = config.providers.vault;
	if (vault?.cardinality === "single" && vault.tuple.options.layer !== undefined) {
		const { layer, ...options } = vault.tuple.options;
		const resolved = await named<Layered>({ layer: layer as EnvironmentLayer });
		out.providers = {
			...config.providers,
			vault: {
				cardinality: "single",
				tuple: { ...vault.tuple, options: { ...options, environment: resolved.environment } },
			},
		};
	}
	return out;
}
