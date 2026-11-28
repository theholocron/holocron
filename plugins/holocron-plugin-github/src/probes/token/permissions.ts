/** One permission the probe tries: the row label, and the one read that needs it. `{r}` is `owner/name`, `{o}` the owner. */
export interface PermissionRead {
	/** The row's label, GitHub's own name for the permission. */
	label: string;
	/** The GET path (after the API base) that needs the permission; `{r}` and `{o}` are filled from the plugin's `repo`. */
	path: string;
	/** True when the read succeeds for any token on a public repository, so a success cannot show the token has the permission. */
	publicRead?: true;
}

/**
 * Every permission the GitHub plugin's tokens are declared against, by the name the declaration uses, with one read
 * that needs it. A read proves the token can see the area, not that it can write to it: GitHub exposes no list of a
 * fine-grained token's permissions, so the write half of `read/write` is taken from the permission table in
 * `docs/src/content/docs/tokens.mdx`. On a public repository the `contents`, `actions`, `issues`, `pull-requests` and `environments`
 * reads succeed for any token, so only the other permissions can prove a permission absent. Names with more than one
 * word are hyphenated, not underscored: `holocron probe docs tokens` strips `_` (Markdown emphasis) from a table cell
 * before it compares the id with the declaration.
 */
export const PERMISSIONS = {
	contents: { label: "Contents", path: "/repos/{r}/contents", publicRead: true },
	actions: { label: "Actions", path: "/repos/{r}/actions/runs?per_page=1", publicRead: true },
	issues: { label: "Issues", path: "/repos/{r}/issues?per_page=1", publicRead: true },
	"pull-requests": { label: "Pull requests", path: "/repos/{r}/pulls?per_page=1", publicRead: true },
	administration: { label: "Administration", path: "/repos/{r}/actions/permissions" },
	secrets: { label: "Secrets", path: "/repos/{r}/actions/secrets?per_page=1" },
	environments: { label: "Environments", path: "/repos/{r}/environments?per_page=1", publicRead: true },
	"actions-variables": { label: "Variables", path: "/repos/{r}/actions/variables?per_page=1" },
	"custom-properties": { label: "Custom properties", path: "/repos/{r}/properties/values" },
	pages: { label: "Pages", path: "/repos/{r}/pages" },
	webhooks: { label: "Webhooks", path: "/repos/{r}/hooks?per_page=1" },
	"org-webhooks": { label: "Organization: Webhooks", path: "/orgs/{o}/hooks?per_page=1" },
	"org-members": { label: "Organization: Members", path: "/orgs/{o}/members?per_page=1" },
	"org-variables": { label: "Organization: Variables", path: "/orgs/{o}/actions/variables?per_page=1" },
	"org-secrets": { label: "Organization: Secrets", path: "/orgs/{o}/actions/secrets?per_page=1" },
	// Read only by the backfill (`probe github issue-types`), so no token declares them (a declaration cannot say
	// "optional"): with no layer the probe describes them (`info` when missing), under a layer it does not try them.
	// The fields list is the issues token's, the types list the org token's. `issue-types` is the REST read of what the
	// backfill reads over GraphQL (`organization.issueTypes`); it is not proven against the live service.
	"issue-fields": { label: "Organization: Issue fields", path: "/orgs/{o}/issue-fields" },
	"issue-types": { label: "Organization: Issue types", path: "/orgs/{o}/issue-types" },
	"user-sync-contents": { label: "Contents (.github-private)", path: "/repos/{o}/.github-private/contents" },
} as const satisfies Record<string, PermissionRead>;

/** A permission name the declaration may use. */
export type Permission = keyof typeof PERMISSIONS;
