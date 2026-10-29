// ── Constants ───────────────────────────────────────────────────────────────
export { CLOUDFLARE_ACCOUNT_ID } from "./constants.js";

// ── compose() — re-exported from the CLI for convenience ────────────────────
export type { Capability, ComposedPreset } from "../config/compose/index.js";
export { compose } from "../config/compose/index.js";

// ── Capability factories ────────────────────────────────────────────────────
// Use these with compose() to build a preset:
//   compose(node(), typecheck(), docs())
export type { AuditOptions } from "./capabilities/audit.js";
export { audit } from "./capabilities/audit.js";
export { docs } from "./capabilities/docs.js";
export { monorepo as monorepoCapability } from "./capabilities/monorepo.js";
export type { NextjsOptions } from "./capabilities/nextjs.js";
export { nextjs as nextjsBundle } from "./capabilities/nextjs.js";
export { node } from "./capabilities/node.js";
export type { ReactOptions } from "./capabilities/react.js";
export { react as reactCapability } from "./capabilities/react.js";
export { typecheck } from "./capabilities/typecheck.js";
export { wiki as wikiCapability } from "./capabilities/wiki.js";

// ── Preset shims ────────────────────────────────────────────────────────────
// Backward-compatible wrappers around compose(). Prefer the capability API
// for new repos — these exist so existing configs don't need to change at once.
export { monorepo } from "./configs/monorepo.js";
export { nextjs } from "./configs/nextjs.js";
export type { NodeDocsPreset, NodeDocsSitePreset } from "./configs/node-docs.js";
export { nodeDocs, nodeDocsSite } from "./configs/node-docs.js";
export { react } from "./configs/react.js";

// HolocronPreset is now ComposedPreset — re-exported for backward compat
export type { HolocronPreset } from "./configs/node.js";
