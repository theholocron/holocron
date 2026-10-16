import type { LoadedConfig } from "../../config/load-config/index.js";
import { PluginLoader, type RuntimeContext } from "../../plugin/loader/index.js";

export type DoctorPrintLine = (line: string) => void;

export type DoctorStatus = "ok" | "fail" | "skip";

export interface DoctorRow {
	capability: string;
	provider: string;
	status: DoctorStatus;
	message: string;
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
