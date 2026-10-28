import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, type RuntimeContext } from "../../plugin/index.js";

export type MonitoringResolveChecksPrint = (line: string) => void;

export interface RunMonitoringResolveChecksInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** File path to write the resolved checks to, as a JSON array. */
	outFile: string;
	loader?: PluginLoader;
	print?: MonitoringResolveChecksPrint;
}
