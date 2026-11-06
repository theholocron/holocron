import { mergeByKey, shallowMerge, union } from "@theholocron/kyber/config";

import type { RepoConfig } from "../../config/index.js";
import { mergeSync } from "../merge-sync/index.js";

type RepoFragment = Partial<Omit<RepoConfig, "name">>;

const names = union<string>();
const properties = shallowMerge<NonNullable<RepoFragment["properties"]>>();
const teamsByKey = mergeByKey<NonNullable<RepoFragment["teams"]>[number]>((t) => (typeof t === "string" ? t : t.slug));

/**
 * Merge one capability's `repo` fragment onto what earlier ones gave. Scalars: last writer wins. `properties`: shallow
 * merge. `variables`: merged per scope (`repo`, `org`), and `sync` entries by environment and scope. `secrets`: each name list is a union, and `sync` entries merge by
 * environment and scope. `topics`: union. `teams`: merged by slug.
 */
export function mergeRepo(prev: RepoFragment, next: RepoFragment): RepoFragment {
	const { properties: nextProperties, topics, teams, variables, secrets, ...scalars } = next;
	const repo: RepoFragment = { ...prev, ...scalars };
	if (nextProperties) repo.properties = properties.merge(repo.properties ?? {}, nextProperties);
	if (variables) {
		repo.variables = {
			...repo.variables,
			...variables,
			...(repo.variables?.repo || variables.repo ? { repo: { ...repo.variables?.repo, ...variables.repo } } : {}),
			...(repo.variables?.org || variables.org ? { org: { ...repo.variables?.org, ...variables.org } } : {}),
			...(repo.variables?.sync || variables.sync
				? { sync: mergeSync(repo.variables?.sync, variables.sync) }
				: {}),
		};
	}
	if (secrets) {
		// Names add up across presets: each list is a union, each environment's too.
		const environments = { ...repo.secrets?.environments };
		for (const [env, list] of Object.entries(secrets.environments ?? {})) {
			environments[env] = names.merge(environments[env] ?? [], list);
		}
		repo.secrets = {
			...(repo.secrets?.repo || secrets.repo
				? { repo: names.merge(repo.secrets?.repo ?? [], secrets.repo ?? []) }
				: {}),
			...(repo.secrets?.org || secrets.org
				? { org: names.merge(repo.secrets?.org ?? [], secrets.org ?? []) }
				: {}),
			...(Object.keys(environments).length > 0 ? { environments } : {}),
			...(repo.secrets?.sync || secrets.sync ? { sync: mergeSync(repo.secrets?.sync, secrets.sync) } : {}),
		};
	}
	if (topics) repo.topics = names.merge(repo.topics ?? [], topics);
	if (teams) repo.teams = teamsByKey.merge(repo.teams ?? [], teams);
	return repo;
}
