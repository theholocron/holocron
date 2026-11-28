import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, type RuntimeContext } from "../../plugin/index.js";

export type DoctorPrintLine = (line: string) => void;

export type DoctorStatus = "ok" | "fail" | "skip";

export interface DoctorRow {
	capability: string;
	provider: string;
	status: DoctorStatus;
	message: string;
	/**
	 * Safe-for-telemetry variant of `message`. Set only when `message` was
	 * enriched with vendor response-body text (sanitized and length-capped
	 * for terminal display, but still not something that belongs in a
	 * remote logging/telemetry sink) — the structured logger uses this
	 * instead of `message` when present. Absent rows fall back to
	 * `message`, which is always our own descriptive text.
	 */
	logMessage?: string;
}

export interface DoctorReport {
	rows: DoctorRow[];
	summary: { ok: number; fail: number; skip: number };
}

export interface RunDoctorInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Lets tests inject mock plugins; defaults to native dynamic import. */
	loader?: PluginLoader;
	print?: DoctorPrintLine;
}
