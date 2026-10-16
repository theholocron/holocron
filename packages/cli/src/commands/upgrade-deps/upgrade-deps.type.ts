import type { Logger } from "@theholocron/observability/core";

// ── npm registry ─────────────────────────────────────────────────────────────

export type FetchLatest = (pkg: string) => Promise<string | null>;

export interface CatalogBump {
	pkg: string;
	from: string;
	to: string;
}

// ── 2. holocron.config.ts migration (7.x → 8.x) ──────────────────────────────

export interface ConfigMigration {
	content: string;
	changed: boolean;
	transforms: string[];
	warnings: string[];
}

// ── public API ───────────────────────────────────────────────────────────────

export interface RunUpgradeDepsInput {
	/** Repo root. Defaults to `process.cwd()`. */
	cwd?: string;
	/** Print what would change without writing. */
	dryRun?: boolean;
	/** Skip the `holocron.config.ts` migration (pins only). */
	pinsOnly?: boolean;
	print?: (line: string) => void;
	logger?: Logger;
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	fetchLatest?: FetchLatest;
}

export type UpgradeDepsStatus = "ok" | "fail" | "dry-run";

export interface UpgradeDepsReport {
	status: UpgradeDepsStatus;
	bumps: readonly CatalogBump[];
	configMigrated: boolean;
	configWarnings: readonly string[];
	message?: string;
}
