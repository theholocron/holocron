import type { GitExec } from "@theholocron/git-utils";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope, Source } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";

/** An environment `doctor secrets --env` can be asked about. */
export type DoctorEnvironment = "local" | "dev" | "ci" | "test" | "prod";

export interface RunDoctorSecretsInput {
	/** The loaded config: `repo.secrets`, the tasks and the notification layouts say which secrets must exist. */
	loaded: LoadedConfig;
	/** The runtime context; `org` says where the organization's secrets live. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/** The loader for the `local` and `dev` side, which must not read the providers' values. Defaults to one that does not. */
	credentialsLoader?: PluginLoader;
	/** Loads a plugin package for its `tokens`. Defaults to resolving from the working directory. */
	importer?: AuthImporter;
	/** Replaces the `git` call that reads the repo's `origin`, for tests. */
	gitExec?: GitExec;
	/**
	 * The environments to check. Omit it to run every environment the config declares: `ci` (the GitHub secrets
	 * `repo.secrets.sync` fills) and `prod` (the `repo.secrets.deploy` destinations). An environment named here that this
	 * command does not cover yet (`local`, `dev`) or that has no layer (`test`) is a skipped row.
	 */
	environments?: readonly DoctorEnvironment[];
	/** Show only the secrets block (`--only-secrets`) or only the variables block (`--only-variables`). Both when omitted. */
	only?: "secrets" | "variables";
	/** An `extra` name is a failure instead of an `info` row (`--strict`). */
	strict?: boolean;
	/** Print how each place stands for this one name and exit 0 (`--name`). */
	name?: string;
	/** The terminal's width in columns, for laying the matrix out. Defaults to the real terminal's, else 100. */
	width?: number;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorSecretsReport {
	/** `fail` if any row failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}

/** The secret names the config says must exist, by scope. */
export interface ExpectedSecrets {
	/** Repository secrets. */
	repo: string[];
	/** Organization secrets. */
	org: string[];
	/** Environment secrets, by environment name. */
	environments: Record<string, string[]>;
}

/** What `repo.secrets.sync` adds to the expected secrets. */
export interface SyncedSecrets {
	/** The names expected at each scope, and for an organization entry the repositories (by name) that may read them. */
	scopes: Array<{ scope: SecretScope; names: string[]; repos?: string[] }>;
	/** A row for each entry that could not be resolved. */
	rows: CheckRow[];
}

/** Either why a variable scope could not be read, or the problems found there (none when it matches) and the names it holds. */
export type VariableScopeResult = { skip: string } | { problems: string[]; checked: number; have?: string[] };

/** One variable scope to read through the `source` provider and compare. */
export interface VariableScopeCheck {
	/** The row id. */
	id: string;
	/** The row title. */
	title: string;
	/** Whether this reads the repository's variables or an organization's. */
	scope: "repo" | "org";
	/** Reads the scope and compares it. */
	run(source: Source): Promise<VariableScopeResult>;
}

/** What one variable scope held when it was read, by name only. */
export interface VariableObservation {
	/** The repository's variables or an organization's. */
	scope: "repo" | "org";
	/** The names found there; absent when the scope could not be read. */
	have?: string[];
	/** Why the scope could not be read, when it could not. */
	unread?: string;
}

/** The result of the variable checks. */
export interface VariableRowsResult {
	/** Whether the config declares any variable to check. */
	declared: boolean;
	/** The rows to show. */
	rows: CheckRow[];
	/** One observation per scope read, for the matrix. */
	observations: VariableObservation[];
}

/** What one cell of the matrix says about a name in one place. */
export type MatrixCell = "ok" | "n/a" | "MISSING" | "extra" | "?";

/** One place a name can be stored: a column of the matrix. */
export interface MatrixColumn {
	/** A stable id, such as `1password:ci` or `github:repo`. */
	id: string;
	/** What stores it: the vault provider (1Password), GitHub or a deployment. Columns are grouped by this. */
	group: string;
	/** The place within its group: a layer, a scope or an environment name. */
	label: string;
	/** The environment that `--env` selects this column with. */
	env: "local" | "dev" | "ci" | "prod";
	/** The column's MISSING names are already a failing row of another check, so the matrix adds none. */
	reportedElsewhere?: boolean;
	/** When the column cannot be read, another check already has a skipped row that says why, so the matrix adds none. */
	unreadReported?: boolean;
}

/** What is known about one place: the names it holds, the names it should hold and why. Names only. */
export interface MatrixPlace {
	/** The column the place fills. */
	column: MatrixColumn;
	/** Whether the names are secrets or variables, which decides the block they appear in. */
	kind: "secret" | "variable";
	/** The names found there. Absent when the place could not be read. */
	present?: string[];
	/** The names the config says it should hold. */
	needed: string[];
	/** Why a name is needed, by upper-case name, for the `--name` lookup. */
	reasons?: Record<string, string>;
	/** Why the place could not be read, when it could not. */
	unread?: string;
}

/** One name and its cell in each column. */
export interface MatrixRow {
	/** The name, in the spelling the config uses when it has one. */
	name: string;
	/** The cell for each column id. */
	cells: Record<string, MatrixCell>;
}

/** The matrix: the columns, then one block of rows for secrets and one for variables. */
export interface Matrix {
	/** The columns of the secrets block, then of the variables block, grouped and in a stable order. */
	columns: { secret: MatrixColumn[]; variable: MatrixColumn[] };
	/** One row per secret name. */
	secrets: MatrixRow[];
	/** One row per variable name. */
	variables: MatrixRow[];
	/** The places the matrix was built from, kept for the rows and the name lookup. */
	places: MatrixPlace[];
}

/** What one GitHub secret scope held when it was read, by name only. */
export interface SecretObservation {
	/** The scope that was read. */
	scope: SecretScope;
	/** The names the config says it should hold. */
	needed: string[];
	/** The names found there; absent when the scope could not be read. */
	have?: string[];
	/** Why the scope could not be read, when it could not. */
	unread?: string;
}

/** One variable name the configured plugins take, and whether every plugin that lists it only falls back to it. */
export interface ExpectedToken {
	/** The variable's name. */
	name: string;
	/** Whether every plugin that lists it only falls back to it. */
	optional: boolean;
}

/** What the `local` and `dev` side gave: its rows and its places for the matrix. */
export interface CredentialsRowsResult {
	/** The rows to show. */
	rows: CheckRow[];
	/** One place per credentials Environment that was read or could not be found. */
	places: MatrixPlace[];
}
