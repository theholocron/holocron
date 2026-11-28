import type { RunLogger } from "../../tasks/index.js";

/** The `RunLogger` used when the caller injects none: drops every record. */
export const noopLogger: RunLogger = { debug() {}, warn() {} };
