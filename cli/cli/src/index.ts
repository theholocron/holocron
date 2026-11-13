export * from "./auth/index.js";
export type {
	PermissionRule,
	PluginToken,
	TokenExpectation,
	TokenRotation,
	VerifyTokenFailure,
	VerifyTokenResult,
	VerifyTokenSuccess,
} from "./commands/auth/index.js";
export * from "./commands/notifications-sync-roles/public.js";
export * from "./commands/setup/derived-properties/index.js";
export { CANONICAL_LABELS } from "./commands/setup/labels.js";
export type { EnvironmentLayer } from "./credentials-environments/index.js";
// `tokenExpectations()` is the one reader of what a plugin's tokens declare (`PluginToken.expect`), for the token
// probes, the doctor and the docs check (#2149).
export * from "./commands/token-expectations/index.js";
// How old or how near expiry a token is, as probe rows, for any provider's token probe (#2157).
export * from "./commands/token-rotation/index.js";
// The 1Password plugin's `export-environment` probe resolves a layer word and decides where secrets may be written
// with the same pieces `sync secrets` and `export tokens` use.
export type { AuthExportOutKind } from "./commands/auth-export/auth-export.type.js";
export { stdoutKind } from "./commands/auth-export/stdout-kind/index.js";
export { resolveEnvironmentId } from "./commands/secrets-sync/resolve-environment-id/index.js";
// The private directory every command that writes a secret-bearing file shares (#2078).
export * from "./config/compose/index.js";
export * from "./config/config/index.js";
export * from "./config/config-system.js";
export { ignoreAdvice, PRIVATE_CREDENTIALS_FILE, resolveCredentialsFile } from "./private-dir/index.js";
// Sentinel loads a repo's `.holocron/` from the GitHub API and applies it with the same rules `loadConfig` uses.
export * from "./config/load-config/holocron-areas/index.js";
export * from "./config/load-config/place-areas/index.js";
export * from "./plugin/capabilities/index.js";
export * from "./plugin/issues-provider/index.js";
export * from "./plugin/probes/index.js";
export type * from "./plugin/provider-actions/index.js";
// Plugins build their REST clients with the shared HTTP primitives; `plugin-create` scaffolds import them from here.
export {
	createRestClient,
	type RequestOptions,
	type RestClient,
	type RestClientConfig,
} from "@theholocron/http-client";
