import type { discoverWorkspacePackages } from "@theholocron/astromech";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";

export interface PackageJson {
	name?: string;
	homepage?: string;
	private?: boolean;
	main?: string;
	exports?: unknown;
	bin?: Record<string, string> | string;
	peerDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	workspaces?: string[];
}

export interface RunSyncReadmeInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	readFileFn?: (path: string, encoding: BufferEncoding) => Promise<string>;
	writeFileFn?: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
	/** Replaces the workspace scan that fills the packages table. */
	discoverFn?: typeof discoverWorkspacePackages;
}

export interface SyncReadmeReport {
	status: "ok" | "fail" | "dry-run";
	updated: boolean;
	message?: string;
}
