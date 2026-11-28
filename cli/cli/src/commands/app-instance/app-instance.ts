import { ConfigError } from "@theholocron/kyber/config";

import type { AppTarget } from "../app-env/index.js";
import type { AppInstance } from "./app-instance.type.js";

/**
 * The project, domain and deployment target an app's `--env` target goes to. `production` is the project named like the
 * app, as its production target. `preview` is the instance the app declares in its `deployment` options
 * (`instances: { preview: { project, domain } }`): a project of its own, deployed as that project's production target
 * with the `crons` left out of its `vercel.json`, because the crons belong to production. An app that declares no preview
 * instance keeps the earlier meaning: a Vercel preview deployment of its one project.
 *
 * @param app - The app folder's name.
 * @param options - The `deployment` provider's options from the app's config.
 * @param target - The target `--env` named.
 * @throws {ConfigError} For an `instances.preview` that is not an object with a `project` name.
 */
export function appInstance(app: string, options: Record<string, unknown>, target: AppTarget): AppInstance {
	const domain = typeof options.domain === "string" ? { domain: options.domain } : {};
	if (target === "production") return { project: app, ...domain, production: true, omitCrons: false };

	const instances = options.instances;
	const declared =
		instances && typeof instances === "object" ? (instances as Record<string, unknown>).preview : undefined;
	if (declared === undefined) return { project: app, ...domain, production: false, omitCrons: false };
	if (!declared || typeof declared !== "object") {
		throw new ConfigError(
			`${app}: \`deployment\` option \`instances.preview\` must be an object with a \`project\``
		);
	}
	const { project, domain: instanceDomain } = declared as Record<string, unknown>;
	if (typeof project !== "string" || project === "") {
		throw new ConfigError(`${app}: \`instances.preview\` needs a \`project\` name`);
	}
	return {
		project,
		...(typeof instanceDomain === "string" ? { domain: instanceDomain } : {}),
		production: true,
		omitCrons: true,
	};
}
