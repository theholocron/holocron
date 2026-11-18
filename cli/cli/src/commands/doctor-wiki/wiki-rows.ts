import type { CheckRow } from "@theholocron/kyber/ui";

import type { WikiInspection, WikiProbe } from "../../plugin/index.js";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({ id, title, status, detail, problems });

/** How many names a row lists before it says how many more there are. */
const LISTED = 5;
const names = (paths: string[]): string =>
	paths.length > LISTED ? `${paths.slice(0, LISTED).join(", ")} and ${paths.length - LISTED} more` : paths.join(", ");

/**
 * One address: an answer below 400 passes, a 401 or 403 passes too (the site is there and restricts who reads it:
 * password protection is set in the provider's dashboard), a 404 or any other status fails, and no answer at all is a
 * skip, since a machine with no network says nothing about the site.
 */
function siteRow(id: string, title: string, probe: WikiProbe, notFoundHint: string): CheckRow {
	if (probe.status === undefined) {
		return row(id, title, "skip", `${probe.url}: ${probe.error ?? "no answer"}`);
	}
	if (probe.status < 400) return row(id, title, "ok", `${probe.url} answers ${probe.status}`);
	if (probe.status === 401 || probe.status === 403) {
		return row(id, title, "ok", `${probe.url} answers ${probe.status} (access is restricted)`);
	}
	const problem =
		probe.status === 404
			? `${probe.url} answers 404; ${notFoundHint}`
			: `${probe.url} answers ${probe.status}, expected a page`;
	return row(id, title, "fail", `${probe.url} answers ${probe.status}`, [problem]);
}

/**
 * The rows `holocron doctor wiki` prints for one {@link WikiInspection}: organization, docs instance, the site and its
 * custom domain, the navigation against the sources, pages the navigation leaves out (information only) and the
 * published page index. Pure; a thing that could not be read is a skip with the reason, never a failure.
 */
export function wikiRows(found: WikiInspection, providerName: string): CheckRow[] {
	const rows: CheckRow[] = [];

	const { declared, found: foundOrg } = found.organization;
	if (foundOrg === null) {
		const problem = `fern/fern.config.json has no organization; \`holocron setup\` writes it`;
		rows.push(row("wiki:organization", "organization is set", "fail", problem, [problem]));
	} else if (foundOrg !== declared) {
		const problem = `fern/fern.config.json names ${foundOrg}, the config declares ${declared}; run \`holocron setup\``;
		rows.push(
			row("wiki:organization", "organization is set", "fail", `${foundOrg}, declared ${declared}`, [problem])
		);
	} else {
		rows.push(row("wiki:organization", "organization is set", "ok", `${declared} in fern/fern.config.json`));
	}

	const instance = found.instance;
	if (instance === null) {
		const problem = "fern/docs.yml does not exist; `holocron setup` writes it";
		rows.push(row("wiki:instance", "docs site is declared", "fail", problem, [problem]));
	} else {
		const problems: string[] = [];
		if (instance.foundUrl !== instance.expectedUrl) {
			problems.push(`instance url is ${instance.foundUrl ?? "not set"}, expected ${instance.expectedUrl}`);
		}
		if (instance.expectedDomain !== undefined && instance.foundDomain !== instance.expectedDomain) {
			problems.push(`custom-domain is ${instance.foundDomain ?? "not set"}, expected ${instance.expectedDomain}`);
		}
		rows.push(
			problems.length > 0
				? row("wiki:instance", "docs site is declared", "fail", `${problems.length} problem(s)`, [
						...problems.map((p) => `fern/docs.yml: ${p}`),
					])
				: row("wiki:instance", "docs site is declared", "ok", `${instance.expectedUrl} in fern/docs.yml`)
		);
	}

	const [site, domain] = found.site;
	if (site) {
		rows.push(
			siteRow(
				"wiki:site",
				"docs site answers",
				site,
				`the organization or its docs are not published; run the wiki workflow (\`fern generate --docs\`)`
			)
		);
	}
	if (domain) {
		rows.push(
			siteRow(
				"wiki:domain",
				"custom domain answers",
				domain,
				`check the ${providerName} dashboard for the domain and \`holocron doctor dns\` for its record`
			)
		);
	}

	if (found.navigation === null) {
		rows.push(row("wiki:navigation", "navigation pages exist", "skip", "no fern/docs.yml to read"));
	} else if (found.navigation.missing.length > 0) {
		const problems = found.navigation.missing.map((p) => `${p} is listed in fern/docs.yml but is not on disk`);
		rows.push(
			row(
				"wiki:navigation",
				"navigation pages exist",
				"fail",
				`${found.navigation.missing.length} missing`,
				problems
			)
		);
	} else {
		rows.push(
			row("wiki:navigation", "navigation pages exist", "ok", `${found.navigation.listed} listed pages exist`)
		);
		if (found.navigation.unlisted.length > 0) {
			// Information only: it counts as skipped and never fails the run.
			rows.push(
				row(
					"wiki:unlisted",
					"pages under docs/wiki are listed",
					"skip",
					`info: ${found.navigation.unlisted.length} not in the navigation (${names(found.navigation.unlisted)}); they are not published`
				)
			);
		}
	}

	const published = found.published;
	const listed = found.navigation?.listed;
	if (!published) {
		rows.push(row("wiki:published", "published pages", "skip", "the site's page index could not be asked"));
	} else if (published.pages === undefined) {
		const why = published.status === undefined ? (published.error ?? "no answer") : `answered ${published.status}`;
		rows.push(row("wiki:published", "published pages", "skip", `${published.url}: ${why}`));
	} else if (listed !== undefined && published.pages < listed) {
		const problem = `${published.url} lists ${published.pages} page(s), the navigation lists ${listed}; the last publish is behind (run the wiki workflow)`;
		rows.push(row("wiki:published", "published pages", "fail", `${published.pages} of ${listed}`, [problem]));
	} else {
		rows.push(
			row(
				"wiki:published",
				"published pages",
				"ok",
				listed === undefined
					? `${published.pages} page(s) in ${published.url}`
					: `${published.pages} page(s) published for ${listed} listed`
			)
		);
	}
	return rows;
}
