import { describe, expect, it } from "vitest";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { Vault } from "../../plugin/index.js";
import type { DoctorEnvironment, VariableObservation } from "./doctor-secrets.type.js";
import { matrixPlaces } from "./matrix-places.js";

const VARS = "acme/demo - vars";
const OTHER = "acme/demo - other";

const configOf = (repo: Record<string, unknown>) => ({ repo }) as unknown as ResolvedHolocronConfig;
const vaultOf = (read: (environment: string) => Promise<Record<string, string>>): Vault =>
	({ providerName: "1password", readEnvironment: read }) as unknown as Vault;
const all = () => true;
const input = (
	config: ResolvedHolocronConfig,
	variables: VariableObservation[],
	vault: Vault | { why: string } = { why: "no vault" },
	wants: (env: DoctorEnvironment) => boolean = all
) => ({ config, vault, secrets: [], variables, org: "acme", wants });

describe("matrixPlaces — variables", () => {
	const synced = {
		variables: {
			sync: [
				{ environment: VARS, keys: ["REPO_VAR"] },
				{ environment: VARS, keys: ["ORG_VAR"], scope: "org=acme" },
				{ environment: OTHER, keys: ["ELSEWHERE"] },
			],
		},
	};
	const vault = vaultOf(async () => ({ REPO_VAR: "x", ORG_VAR: "y", ELSEWHERE: "z" }));

	it("takes each variable scope's names from the sync entries that write to it, with no variables declared inline", async () => {
		const places = await matrixPlaces(
			input(
				configOf(synced),
				[
					{ scope: "repo", have: ["REPO_VAR"] },
					{ scope: "org", have: ["ORG_VAR", "FOREIGN"] },
				],
				vault
			)
		);
		const repo = places.find((p) => p.column.id === "github:repo-variables")!;
		const org = places.find((p) => p.column.id === "github:org-variables")!;
		expect(repo.needed).toEqual(["REPO_VAR", "ELSEWHERE"]);
		expect(repo.reasons?.REPO_VAR).toContain("repository variables");
		expect(org.needed).toEqual(["ORG_VAR"]);
		expect(org.reasons?.ORG_VAR).toContain("organization variables");
		expect(org.present).toEqual(["ORG_VAR"]);
	});

	it("lists the names of one Environment's variables only from the entries that name it", async () => {
		const places = await matrixPlaces(input(configOf(synced), [], vault));
		expect(places.find((p) => p.column.id === `vault:${VARS}`)?.needed).toEqual(["REPO_VAR", "ORG_VAR"]);
		expect(places.find((p) => p.column.id === `vault:${OTHER}`)?.needed).toEqual(["ELSEWHERE"]);
	});

	it("shows a scope that could not be read as unread, not empty", async () => {
		const places = await matrixPlaces(input(configOf(synced), [{ scope: "org", unread: "no token" }], vault));
		const org = places.find((p) => p.column.id === "github:org-variables")!;
		expect(org.unread).toBe("no token");
		expect(org.present).toEqual([]);
	});

	it("needs no `variables` block in the config to place what GitHub holds", async () => {
		const places = await matrixPlaces(input(configOf({}), [{ scope: "repo", have: ["STRAY"] }]));
		expect(places).toHaveLength(1);
		expect(places[0]).toMatchObject({ kind: "variable", needed: [], present: ["STRAY"] });
	});
});

describe("matrixPlaces — the vault", () => {
	it("says which Environment could not be read when the vault fails with something other than a missing token", async () => {
		const config = configOf({ secrets: { sync: [{ environment: VARS, keys: ["A"] }] } });
		const vault = vaultOf(async () => {
			throw new Error("boom");
		});
		const places = await matrixPlaces(input(config, [], vault));
		const place = places.find((p) => p.column.id === `vault:${VARS}`)!;
		expect(place.unread).toBe(`could not read vault environment ${VARS}: boom`);
		expect(place.present).toBeUndefined();
	});
});
