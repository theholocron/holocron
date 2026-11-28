import type { Logger } from "@theholocron/observability/core";

/** The two log levels the call log writes at. */
export type GitHubCallLogger = Pick<Logger, "info" | "warn">;
