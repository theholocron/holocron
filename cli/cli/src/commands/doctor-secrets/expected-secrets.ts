import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { NotificationsLayout } from "../../plugin/index.js";
import { layoutSecretNames } from "../notifications-channel-add/index.js";
import type { ExpectedSecrets } from "./doctor-secrets.type.js";
import { uniqueNames } from "./unique-names.js";

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
		repo: uniqueNames([...(declared?.repo ?? []), ...chromatic]),
		org: uniqueNames([...(declared?.org ?? []), ...layouts.flatMap(layoutSecretNames)]),
		environments: Object.fromEntries(
			Object.entries(declared?.environments ?? {}).map(([env, names]) => [env, uniqueNames(names)])
		),
	};
}
