import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { NotificationsLayout } from "../../plugin/index.js";
import { layoutSecretNames } from "../notifications-channel-add/index.js";
import type { ExpectedSecrets } from "./doctor-secrets.type.js";

/** Names that differ only in case are one secret to GitHub, so the first spelling wins. */
const unique = (names: string[]): string[] => {
	const seen = new Map<string, string>();
	for (const name of names) if (!seen.has(name.toUpperCase())) seen.set(name.toUpperCase(), name);
	return [...seen.values()];
};

/**
 * The secret a Chromatic project reads: `CHROMATIC_PROJECT_TOKEN` for `default` (or no name), otherwise
 * `CHROMATIC_PROJECT_TOKEN_<NAME>`.
 */
const chromaticSecret = (tokenName: string | undefined): string =>
	!tokenName || tokenName === "default"
		? "CHROMATIC_PROJECT_TOKEN"
		: `CHROMATIC_PROJECT_TOKEN_${tokenName.toUpperCase()}`;

/**
 * The secrets the config says must exist: the names listed in `repo.secrets`, plus the ones it implies. A
 * notification layout fills a secret per webhook and per role (organization scope), and each project of a
 * `verification.visualRegression` task reads a Chromatic token (repository scope).
 */
export function expectedSecrets(config: ResolvedHolocronConfig, layouts: NotificationsLayout[]): ExpectedSecrets {
	const declared = config.repo?.secrets;
	const chromatic = (config.tasks ?? []).flatMap((task) =>
		typeof task === "object" && task.name === "verification.visualRegression"
			? (task.with?.["chromatic-projects"] ?? []).map((project) => chromaticSecret(project.tokenName))
			: []
	);
	return {
		repo: unique([...(declared?.repo ?? []), ...chromatic]),
		org: unique([...(declared?.org ?? []), ...layouts.flatMap(layoutSecretNames)]),
		environments: Object.fromEntries(
			Object.entries(declared?.environments ?? {}).map(([env, names]) => [env, unique(names)])
		),
	};
}
