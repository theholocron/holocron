import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { SecretAccess, Secrets } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { describeAccess } from "../secrets-sync/access-note/index.js";

/** One organization's synced secrets, and the repositories their entries say may read them. */
export interface OrgReaders {
	/** The organization. */
	org: string;
	/** Secret name to the repository names (sorted) its entry declares. */
	declared: Map<string, string[]>;
}

/** The problems with who can read one secret, or none: names only. */
function readerProblems(name: string, wanted: string[], actual: SecretAccess): string[] {
	const to = `selected [${wanted.join(", ")}]`;
	if (actual.visibility !== "selected") {
		const who = actual.visibility === "all" ? "every repository" : "every private repository";
		return [`${name} is readable by ${who} (visibility ${actual.visibility}); its entry says ${to}`];
	}
	const have = new Set(actual.repos ?? []);
	const extra = [...have].filter((r) => !wanted.includes(r)).sort();
	const missing = wanted.filter((r) => !have.has(r));
	return [
		...(extra.length > 0 ? [`${name} is also readable by ${extra.join(", ")}; its entry says ${to}`] : []),
		...(missing.length > 0 ? [`${name} is not readable by ${missing.join(", ")}; its entry says ${to}`] : []),
	];
}

/**
 * Who can read the synced organization secrets, by name (spec `tech-org-secret-visibility`, #2062): one row for the
 * organization. It fails for a secret readable by more repositories than its entry says (visibility `all` or `private`,
 * or `selected` with an extra repository) or by fewer; a secret that does not exist is the "exist" row's finding, not
 * this one's. An ok row says how many secrets sit at each reader list. It is skipped, with the reason, when the provider
 * cannot report access or the token cannot read it. GitHub returns no value, and none is read.
 *
 * @param secrets - The `secrets` provider.
 * @param readers - The organization and its declared readers.
 * @param isOwn - Whether the organization is the one the run is in (its row id has no suffix).
 */
export async function accessRow(secrets: Secrets, readers: OrgReaders, isOwn: boolean): Promise<CheckRow> {
	const id = isOwn ? "org-secret-access" : `org-secret-access-${readers.org}`;
	const title = `${readers.org} organization secrets are readable only by their entries' repositories`;
	if (!secrets.listSecretAccess) {
		return {
			id,
			title,
			status: "skip",
			detail: `secrets provider (${secrets.providerName}) cannot report who can read a secret`,
			problems: [],
		};
	}
	try {
		const found = new Map(
			Object.entries(await secrets.listSecretAccess({ kind: "organization", name: readers.org })).map(
				([name, access]) => [name.toUpperCase(), access]
			)
		);
		const problems: string[] = [];
		const groups = new Map<string, number>();
		for (const [name, wanted] of readers.declared) {
			const actual = found.get(name.toUpperCase());
			if (!actual) continue;
			problems.push(...readerProblems(name, wanted, actual));
			const label = describeAccess(actual);
			groups.set(label, (groups.get(label) ?? 0) + 1);
		}
		if (problems.length > 0) {
			return { id, title, status: "fail", detail: `${problems.length} problem(s)`, problems };
		}
		const summary = [...groups].map(([label, count]) => `${count} ${label}`).join("; ");
		return summary === ""
			? { id, title, status: "skip", detail: "none of the synced secrets exist yet", problems: [] }
			: { id, title, status: "ok", detail: summary, problems: [] };
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return { id, title, status: "skip", detail: noToken, problems: [] };
		return { id, title, status: "fail", detail: errorMessage(err), problems: [] };
	}
}

/**
 * A name that exists at both repository and organization level: the repository secret overrides the organization one,
 * so a stale copy keeps its old value after a rotation. The sync never deletes, so this is how the copy is found.
 * Skipped, with the reason, when the repository's secrets cannot be listed.
 *
 * @param secrets - The `secrets` provider.
 * @param orgNames - The organization secret names the config expects.
 */
export async function shadowRow(secrets: Secrets, orgNames: string[]): Promise<CheckRow> {
	const id = "org-secret-shadowed";
	const title = "no organization secret is overridden by a repository secret of the same name";
	try {
		const repo = new Set((await secrets.listSecrets({ kind: "repo" })).map((n) => n.toUpperCase()));
		const problems = orgNames
			.filter((name) => repo.has(name.toUpperCase()))
			.map((name) => `${name} exists at repository and organization level: the repository secret overrides it`);
		return problems.length > 0
			? { id, title, status: "fail", detail: `${problems.length} problem(s)`, problems }
			: { id, title, status: "ok", detail: `${orgNames.length} checked`, problems: [] };
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return { id, title, status: "skip", detail: noToken, problems: [] };
		return { id, title, status: "fail", detail: errorMessage(err), problems: [] };
	}
}
