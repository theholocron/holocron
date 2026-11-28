import { errorMessage } from "@theholocron/misc-utils";

import type { Deployment } from "../../plugin/index.js";
import type { DomainCheck } from "./app-domain-check.type.js";

/**
 * Checks that the deployment project `project` serves `domain`, the one the app's own config names, so a name that does
 * not belong to the app stops the command before anything is written. A provider that cannot list a project's domains,
 * or an app that declares no domain, is `skipped` with the reason, never a failure.
 *
 * @param deployment - The app's `deployment` capability.
 * @param project - The project name (the app folder's name).
 * @param domain - The app's configured domain, when it has one.
 */
export async function checkProjectDomain(
	deployment: Pick<Deployment, "providerName" | "listDomains">,
	project: string,
	domain: string | undefined
): Promise<DomainCheck> {
	if (!domain)
		return {
			status: "skipped",
			message: `no \`domain\` in the app's config, so ${project}'s domain was not checked`,
		};
	if (!deployment.listDomains) {
		return {
			status: "skipped",
			message: `${deployment.providerName} cannot list a project's domains, so ${project}'s domain was not checked`,
		};
	}
	let served: string[];
	try {
		served = await deployment.listDomains(project);
	} catch (err) {
		return {
			status: "fail",
			message: `cannot read the domains of ${deployment.providerName} project "${project}": ${errorMessage(err)}`,
		};
	}
	if (served.includes(domain)) return { status: "ok", message: `${project} serves ${domain}` };
	return {
		status: "fail",
		message: `${deployment.providerName} project "${project}" does not serve ${domain} (it serves ${served.length ? served.join(", ") : "no domain"}); nothing was written`,
	};
}
