// A preset is a ready-made config fragment: spread it into defineConfig().
//   import { docsPreset } from "@theholocron/cli/presets";
//   const preset = docsPreset();
//
// To build your own, compose() capabilities:
//   import { compose, withCapabilities } from "@theholocron/cli/presets";
//   const { withNode, withTypecheck } = withCapabilities;
//   const preset = compose(withNode(), withTypecheck());

import { audit } from "./capabilities/audit.js";
import { docs } from "./capabilities/docs.js";
import { monorepo } from "./capabilities/monorepo.js";
import { nextjs } from "./capabilities/nextjs.js";
import { node } from "./capabilities/node.js";
import { react } from "./capabilities/react.js";
import { typecheck } from "./capabilities/typecheck.js";
import { wiki } from "./capabilities/wiki.js";

// ── Constants ───────────────────────────────────────────────────────────────
export { CLOUDFLARE_ACCOUNT_ID } from "./constants.js";

// ── compose() — re-exported from the CLI for convenience ────────────────────
export type { Capability, ComposedPreset } from "../config/compose/index.js";
export { compose } from "../config/compose/index.js";

// ── Capability factories ────────────────────────────────────────────────────
/** The capability factories, for composing your own preset with compose(). */
export const withCapabilities = {
	withAudit: audit,
	withDocs: docs,
	withMonorepo: monorepo,
	withNextjs: nextjs,
	withNode: node,
	withReact: react,
	withTypecheck: typecheck,
	withWiki: wiki,
};
export type { AuditOptions } from "./capabilities/audit.js";
export type { NextjsOptions } from "./capabilities/nextjs.js";
export type { ReactOptions } from "./capabilities/react.js";

// ── Presets ─────────────────────────────────────────────────────────────────
export type { DocsPreset, DocsSitePreset } from "./configs/docs.js";
export { docsPreset, docsSitePreset } from "./configs/docs.js";
export { monorepoPreset } from "./configs/monorepo.js";
export { nextjsPreset } from "./configs/nextjs.js";
export { nodePreset } from "./configs/node.js";
export { reactPreset } from "./configs/react.js";
