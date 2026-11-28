import type { CapabilityKey } from "../../plugin/index.js";

/** The capabilities that have no `doctor <capability>` deep check, each with the one-line reason. */
export type NoDeepCheck = Partial<Record<CapabilityKey, string>>;
