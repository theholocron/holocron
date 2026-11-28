import type { CheckRow } from "@theholocron/kyber/ui";

import type { Deployment } from "../../plugin/index.js";
import type { DeclaredProject } from "./doctor-workers.type.js";
import { readFailureRow } from "./read-failure.js";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({ id, title, status, detail, problems });

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The rows for one declared deployment project: it exists, its custom domain (when one is declared) is attached, and
 * the newest production deployment is healthy. A step the provider cannot do, or a token that cannot read it, is a
 * skip; a project that is not there fails and the steps that need it are skipped.
 */
export async function checkProject(
	deploy: Pick<Deployment, "providerName" | "listProjects" | "listDomains" | "latestDeployment">,
	declared: DeclaredProject
): Promise<CheckRow[]> {
	const project = declared.project;
	const ids = {
		exists: `deployment:${project}:exists`,
		domain: `deployment:${project}:domain`,
		deploy: `deployment:${project}:deployment`,
	};
	const titles = {
		exists: `${project} project exists`,
		domain: `${project} has its custom domain`,
		deploy: `${project} latest deployment is healthy`,
	};
	const rows: CheckRow[] = [];

	let exists = false;
	try {
		exists = (await deploy.listProjects()).some((p) => same(p.name, project) || p.id === project);
		rows.push(
			exists
				? row(ids.exists, titles.exists, "ok", `${project} on ${deploy.providerName}`)
				: row(ids.exists, titles.exists, "fail", "not found", [
						`no project ${project} on ${deploy.providerName}; \`holocron setup\` makes it`,
					])
		);
	} catch (err) {
		rows.push(readFailureRow(ids.exists, titles.exists, err));
	}
	const notChecked = (reason: string) => `not checked: ${reason}`;
	const gone = exists ? undefined : "the project is not readable or not there";

	if (declared.hostname === undefined) {
		// Nothing declared to compare, so no row for it.
	} else if (gone) {
		rows.push(row(ids.domain, titles.domain, "skip", notChecked(gone)));
	} else if (!deploy.listDomains) {
		rows.push(
			row(ids.domain, titles.domain, "skip", `the \`${deploy.providerName}\` provider cannot list domains`)
		);
	} else {
		try {
			const attached = await deploy.listDomains(project);
			rows.push(
				attached.some((d) => same(d, declared.hostname!))
					? row(ids.domain, titles.domain, "ok", `${declared.hostname} attached`)
					: row(ids.domain, titles.domain, "fail", `${declared.hostname} not attached`, [
							`${declared.hostname} is not a domain of ${project}; \`holocron setup\` attaches it`,
						])
			);
		} catch (err) {
			rows.push(readFailureRow(ids.domain, titles.domain, err));
		}
	}

	if (gone) {
		rows.push(row(ids.deploy, titles.deploy, "skip", notChecked(gone)));
	} else if (!deploy.latestDeployment) {
		rows.push(
			row(ids.deploy, titles.deploy, "skip", `the \`${deploy.providerName}\` provider cannot list deployments`)
		);
	} else {
		try {
			const latest = await deploy.latestDeployment(project);
			if (!latest) {
				rows.push(row(ids.deploy, titles.deploy, "skip", "no production deployment yet"));
			} else if (latest.status === "ready") {
				rows.push(
					row(ids.deploy, titles.deploy, "ok", latest.createdAt ? `ready, ${latest.createdAt}` : "ready")
				);
			} else if (latest.status === "error") {
				const why = latest.errorMessage ? `: ${latest.errorMessage}` : "";
				rows.push(
					row(ids.deploy, titles.deploy, "fail", "the newest deployment errored", [
						`the newest production deployment of ${project} failed${why}`,
					])
				);
			} else {
				// Queued, building or cancelled: nothing proves it is unhealthy, so it is information, not a failure.
				rows.push(row(ids.deploy, titles.deploy, "skip", `info: the newest deployment is ${latest.status}`));
			}
		} catch (err) {
			rows.push(readFailureRow(ids.deploy, titles.deploy, err));
		}
	}
	return rows;
}
