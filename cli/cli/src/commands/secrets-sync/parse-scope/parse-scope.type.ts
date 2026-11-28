/** Where a synced secret lands: the repo, one of its environments, or an organization. */
export type SecretsScope =
	{ kind: "repo" } | { kind: "environment"; name: string } | { kind: "organization"; name: string };
