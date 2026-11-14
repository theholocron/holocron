/** One permission the probe tries: the row label, and the one read that needs it. `{r}` is `owner/name`, `{o}` the owner. */
export interface PermissionRead {
	/** The row's label, GitHub's own name for the permission. */
	label: string;
	/** The GET path (after the API base) that needs the permission; `{r}` and `{o}` are filled from the plugin's `repo`. */
	path: string;
}

/**
 * Every permission the GitHub plugin's tokens are declared against, by the name the declaration uses, with one read
 * that needs it. A read proves the token can see the area, not that it can write to it: GitHub exposes no list of a
 * fine-grained token's permissions, so the write half of `read/write` is taken from the permission table in
 * `docs/src/content/docs/tokens.mdx`. On a public repository the `contents`, `actions`, `issues` and `pull-requests`
 * reads succeed for any token, so only the other permissions can prove a permission absent. Names with more than one
 * word are hyphenated, not underscored: `holocron probe docs tokens` strips `_` (Markdown emphasis) from a table cell
 * before it compares the id with the declaration.
 */
export const PERMISSIONS = {
	contents: { label: "Contents", path: "/repos/{r}/contents" },
	actions: { label: "Actions", path: "/repos/{r}/actions/runs?per_page=1" },
	issues: { label: "Issues", path: "/repos/{r}/issues?per_page=1" },
	"pull-requests": { label: "Pull requests", path: "/repos/{r}/pulls?per_page=1" },
	administration: { label: "Administration", path: "/repos/{r}/actions/permissions" },
	secrets: { label: "Secrets", path: "/repos/{r}/actions/secrets?per_page=1" },
	environments: { label: "Environments", path: "/repos/{r}/environments?per_page=1" },
	"actions-variables": { label: "Variables", path: "/repos/{r}/actions/variables?per_page=1" },
	"custom-properties": { label: "Custom properties", path: "/repos/{r}/properties/values" },
	pages: { label: "Pages", path: "/repos/{r}/pages" },
	"org-administration": { label: "Organization: Administration", path: "/orgs/{o}/actions/permissions" },
	"org-members": { label: "Organization: Members", path: "/orgs/{o}/members?per_page=1" },
	"org-variables": { label: "Organization: Variables", path: "/orgs/{o}/actions/variables?per_page=1" },
	"org-secrets": { label: "Organization: Secrets", path: "/orgs/{o}/actions/secrets?per_page=1" },
	"user-sync-contents": { label: "Contents (.github-private)", path: "/repos/{o}/.github-private/contents" },
} as const satisfies Record<string, PermissionRead>;

/** A permission name the declaration may use. */
export type Permission = keyof typeof PERMISSIONS;
