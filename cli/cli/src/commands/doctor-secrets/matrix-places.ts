import { describeError } from "@theholocron/kyber/ui";

import { resolvedEnvironment, type ResolvedHolocronConfig } from "../../config/index.js";
import type { SecretScope, Vault } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { deployFilter } from "../secrets-sync/deploy-filter/index.js";
import { parseScope } from "../secrets-sync/parse-scope/index.js";
import { splitDeployKeys } from "../secrets-sync/split-deploy-keys/index.js";
import type {
	DoctorEnvironment,
	MatrixColumn,
	MatrixPlace,
	SecretObservation,
	VariableObservation,
} from "./doctor-secrets.type.js";
import { labelOf, type Layer, layerOf, providerGroup } from "./matrix-names.js";

/** What `matrixPlaces()` is built from. */
export interface MatrixPlacesInput {
	/** The resolved config: the sync and deploy entries say which Environments are looked at and why. */
	config: ResolvedHolocronConfig;
	/** The `vault` provider, already reading each Environment once, or why there is none. */
	vault: Vault | { why: string };
	/** What each GitHub secret scope held. */
	secrets: SecretObservation[];
	/** What each GitHub variable scope held. */
	variables: VariableObservation[];
	/** The organization the run is in. */
	org: string | undefined;
	/** Whether an environment is being checked. */
	wants: (env: DoctorEnvironment) => boolean;
}

function vaultGroup(vault: Vault | { why: string }): string {
	return providerGroup("why" in vault ? undefined : vault.providerName);
}

/** The keys of a vault Environment, by name only, or why they could not be read. */
async function readNames(vault: Vault | { why: string }, environment: string): Promise<string[] | { why: string }> {
	if ("why" in vault) return vault;
	if (!vault.readEnvironment)
		return { why: `vault provider (${vault.providerName}) cannot list an environment's keys` };
	try {
		return Object.keys(await vault.readEnvironment(environment));
	} catch (err) {
		return {
			why: missingTokenReason(err) ?? `could not read vault environment ${environment}: ${describeError(err)}`,
		};
	}
}

const scopeWords = (scope: SecretScope): string =>
	typeof scope === "string" || scope.kind === "repo"
		? "repository"
		: scope.kind === "environment"
			? `${scope.name} environment`
			: `${scope.name} organization`;

const ordinal = (n: number): string => `entry ${n}`;

function addReason(reasons: Record<string, string>, name: string, why: string): void {
	reasons[name.toUpperCase()] ??= why;
}

/**
 * Turns what the checks read into the places of the matrix: the GitHub scopes, the vault Environments the sync and
 * deploy entries name, and the deployments. Names only; the vault values are dropped as they are read. Each place says
 * which names it should hold and why, from the config, so the matrix and the `--name` lookup agree with the checks.
 *
 * @param input - The observations, the config and the vault.
 */
export async function matrixPlaces(input: MatrixPlacesInput): Promise<MatrixPlace[]> {
	const { config, vault, wants } = input;
	const places: MatrixPlace[] = [];
	const group = vaultGroup(vault);
	const syncEntries = config.repo?.secrets?.sync ?? [];
	const deployEntries = config.repo?.secrets?.deploy ?? [];
	const variableEntries = config.repo?.variables?.sync ?? [];

	// The names a deployment or Worker would receive from one Environment: the listed keys, and what the prefixes match.
	const sentTo = (environment: string, present: string[]): string[] => {
		const filter = deployFilter(deployEntries, environment);
		return filter ? splitDeployKeys(present, filter).send : [];
	};

	const names = new Map<string, string[] | { why: string }>();
	const namesOf = async (environment: string) => {
		if (!names.has(environment)) names.set(environment, await readNames(vault, environment));
		return names.get(environment)!;
	};

	if (wants("ci")) {
		// GitHub secrets, one column per scope. What the entries feed is the reason a name is there.
		for (const obs of input.secrets) {
			const reasons: Record<string, string> = {};
			const { scope } = obs;
			const id = scope.kind === "repo" ? "github:repo" : `github:${scope.kind}:${scope.name}`;
			const own = scope.kind === "organization" && scope.name === input.org;
			const column: MatrixColumn = {
				id,
				group: "GitHub",
				label:
					scope.kind === "repo"
						? "repo"
						: scope.kind === "environment"
							? `env ${scope.name}`
							: `org${own ? "" : ` ${scope.name}`}`,
				env: "ci",
				reportedElsewhere: true,
			};
			for (const [index, entry] of syncEntries.entries()) {
				if (JSON.stringify(parseScope(entry.scope ?? "repo")) !== JSON.stringify(scope)) continue;
				const fed = entry.keys ?? ((await namesOf(resolvedEnvironment(entry))) as string[]);
				for (const name of Array.isArray(fed) ? fed : [])
					addReason(
						reasons,
						name,
						`synced to ${scopeWords(scope)} secrets by ${ordinal(index + 1)} of repo.secrets.sync (from ${resolvedEnvironment(entry)})`
					);
			}
			// An organization holds secrets for other repositories too, so only the names this config feeds are shown.
			const present =
				scope.kind === "organization" && obs.have
					? obs.have.filter((name) => obs.needed.some((n) => n.toUpperCase() === name.toUpperCase()))
					: obs.have;
			places.push({
				column,
				kind: "secret",
				needed: obs.needed,
				reasons,
				...(present ? { present } : {}),
				...(obs.unread !== undefined ? { unread: obs.unread } : {}),
			});
		}

		// GitHub variables: one column for the repository and one for the organization.
		const variables = config.repo?.variables;
		for (const scope of ["repo", "org"] as const) {
			const seen = input.variables.filter((o) => o.scope === scope);
			if (seen.length === 0) continue;
			const reasons: Record<string, string> = {};
			const needed = Object.keys(scope === "repo" ? (variables?.repo ?? {}) : (variables?.org ?? {}));
			for (const name of needed) addReason(reasons, name, `declared in repo.variables.${scope}`);
			for (const [index, entry] of variableEntries.entries()) {
				if ((entry.scope ?? "repo").startsWith("org=") !== (scope === "org")) continue;
				for (const name of entry.keys) {
					needed.push(name);
					addReason(
						reasons,
						name,
						`synced to ${scope === "repo" ? "repository" : "organization"} variables by ${ordinal(index + 1)} of repo.variables.sync (from ${resolvedEnvironment(entry)})`
					);
				}
			}
			const unread = seen.find((o) => o.unread !== undefined)?.unread;
			const have = seen.flatMap((o) => o.have ?? []);
			places.push({
				column: {
					id: `github:${scope}-variables`,
					group: "GitHub",
					label: scope === "repo" ? "repo" : "org",
					env: "ci",
					reportedElsewhere: true,
				},
				kind: "variable",
				needed,
				reasons,
				// An organization has variables for other repositories too, so only the names this config feeds are shown.
				present:
					scope === "org"
						? have.filter((n) => needed.some((m) => m.toUpperCase() === n.toUpperCase()))
						: have,
				...(unread !== undefined ? { unread } : {}),
			});
		}
	}

	// The vault Environments the entries read, one column per Environment and kind.
	const envs = new Map<string, { kind: "secret" | "variable"; env: Layer; environment: string }>();
	for (const entry of syncEntries) {
		const environment = resolvedEnvironment(entry);
		envs.set(`secret:${environment}`, { kind: "secret", env: layerOf(environment, "ci"), environment });
	}
	for (const entry of variableEntries) {
		const environment = resolvedEnvironment(entry);
		envs.set(`variable:${environment}`, { kind: "variable", env: layerOf(environment, "ci"), environment });
	}
	for (const entry of deployEntries) {
		const environment = resolvedEnvironment(entry);
		envs.set(`secret:${environment}`, { kind: "secret", env: layerOf(environment, "prod"), environment });
	}
	for (const { kind, env, environment } of envs.values()) {
		if (!wants(env)) continue;
		const found = await namesOf(environment);
		const present = Array.isArray(found) ? found : [];
		const needed: string[] = [];
		const reasons: Record<string, string> = {};
		if (kind === "secret") {
			for (const [index, entry] of syncEntries.entries()) {
				if (resolvedEnvironment(entry) !== environment) continue;
				for (const name of entry.keys ?? present) {
					needed.push(name);
					addReason(
						reasons,
						name,
						`read by ${ordinal(index + 1)} of repo.secrets.sync, which writes it to ${scopeWords(parseScope(entry.scope ?? "repo"))} secrets`
					);
				}
			}
			for (const name of sentTo(environment, present)) {
				needed.push(name);
				addReason(reasons, name, "sent to a deployment or Worker by repo.secrets.deploy");
			}
		} else {
			for (const [index, entry] of variableEntries.entries()) {
				if (resolvedEnvironment(entry) !== environment) continue;
				for (const name of entry.keys) {
					needed.push(name);
					addReason(reasons, name, `written as a variable by ${ordinal(index + 1)} of repo.variables.sync`);
				}
			}
		}
		places.push({
			column: { id: `vault:${environment}`, group, label: labelOf(environment), env, unreadReported: true },
			kind,
			needed,
			reasons,
			...(Array.isArray(found) ? { present } : { unread: found.why }),
		});
	}

	// The deployments: the config names the keys they may receive, not the project or Worker.
	if (wants("prod")) {
		for (const environment of new Set(deployEntries.map(resolvedEnvironment))) {
			const found = await namesOf(environment);
			const needed = sentTo(environment, Array.isArray(found) ? found : []);
			const reasons: Record<string, string> = {};
			for (const name of needed)
				addReason(reasons, name, "a key repo.secrets.deploy lets a deployment or Worker receive");
			places.push({
				column: { id: `deploy:${environment}`, group: "Deploy", label: labelOf(environment), env: "prod" },
				kind: "secret",
				needed,
				reasons,
				unread: "the project or Worker is named when you sync (--project-id, --worker), not in the config, so it is not read",
			});
		}
	}
	return places;
}
