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
export { compose } from "../config/config-system.js";

// ── Capability factories ────────────────────────────────────────────────────
/** The capability factories, for composing your own preset with compose(). */
export const withCapabilities = {
	/** Bundle size auditing, with Knip and Lighthouse when asked. */
	withAudit: audit,
	/** A documentation site deployed to Cloudflare Pages with pull request previews. */
	withDocs: docs,
	/** Settings for a monorepo's workspaces. */
	withMonorepo: monorepo,
	/** A Next.js application: Vercel deployment and Cypress tests on top of React. */
	withNextjs: nextjs,
	/** The base library tasks for a Node project, without type-checking. */
	withNode: node,
	/** Adds React and Storybook UI testing. */
	withReact: react,
	/** Adds TypeScript type-checking. */
	withTypecheck: typecheck,
	/** Publishes the engineering wiki. */
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
