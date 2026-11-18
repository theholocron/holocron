import type { CheckRow } from "@theholocron/kyber/ui";

import type { ErrorsInspection } from "../../plugin/index.js";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({ id, title, status, detail, problems });

/**
 * The rows `holocron doctor errors` prints for one {@link ErrorsInspection}: the organization, then for each declared
 * project that it exists, has a client key and is watched by an enabled alert rule. Pure. A project missing, a project
 * with no key and a project no enabled rule watches fail; alert rules the token could not read are a skip. The Comlink
 * relay's integration and rule have their own rows in `doctor notifications`.
 */
export function errorsRows(found: ErrorsInspection, providerName: string): CheckRow[] {
	const orgSlug = found.org.slug;
	if (!found.org.exists) {
		const problem = `${providerName} has no organization named ${orgSlug}; check the \`org\` option of the \`errors\` provider`;
		const rows = [row("errors:org", "organization exists", "fail", `${orgSlug} not found`, [problem])];
		for (const project of found.projects) {
			rows.push(
				row(
					`errors:project:${project.slug}`,
					`project ${project.slug} exists`,
					"skip",
					"not checked: no organization"
				)
			);
		}
		return rows;
	}

	const rows = [row("errors:org", "organization exists", "ok", `${orgSlug} (${found.org.name ?? orgSlug})`)];
	if (found.projects.length === 0) {
		rows.push(
			row("errors:projects", "declared projects", "skip", "none declared: no `relay.errors.projects` in a layout")
		);
		return rows;
	}

	for (const project of found.projects) {
		const slug = project.slug;
		if (!project.exists) {
			const problem = `no project ${slug} in ${found.org.slug}; create it in ${providerName}`;
			rows.push(
				row(`errors:project:${slug}`, `project ${slug} exists`, "fail", "not found", [problem]),
				row(`errors:dsn:${slug}`, `project ${slug} has a key`, "skip", "not checked: no project"),
				row(`errors:alerts:${slug}`, `project ${slug} has an alert rule`, "skip", "not checked: no project")
			);
			continue;
		}
		rows.push(row(`errors:project:${slug}`, `project ${slug} exists`, "ok", slug));

		rows.push(
			project.hasDsn
				? row(`errors:dsn:${slug}`, `project ${slug} has a key`, "ok", "a client key (DSN) exists")
				: row(`errors:dsn:${slug}`, `project ${slug} has a key`, "fail", "no client key", [
						`${slug} has no client key, so an SDK has no DSN to send to; add one in ${providerName}`,
					])
		);

		if (project.alertRules === undefined) {
			rows.push(
				row(
					`errors:alerts:${slug}`,
					`project ${slug} has an alert rule`,
					"skip",
					found.alertsUnreadable ? `could not read the alert rules: ${found.alertsUnreadable}` : "not read"
				)
			);
		} else if (project.alertRules === 0) {
			rows.push(
				row(`errors:alerts:${slug}`, `project ${slug} has an alert rule`, "fail", "no enabled rule", [
					`no enabled alert rule watches ${slug}, so its errors reach no one`,
				])
			);
		} else {
			rows.push(
				row(
					`errors:alerts:${slug}`,
					`project ${slug} has an alert rule`,
					"ok",
					`${project.alertRules} enabled rule(s)`
				)
			);
		}
	}
	return rows;
}
