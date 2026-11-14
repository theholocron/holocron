---
id: SPEC-0084
status: proposed
issue: theholocron/holocron#2149
blocked-by: []
discussion:
  url: https://discord.com/channels/1303969001822486568/1570940201059229829
---

# Token declaration

Child of epic #2147 (check the permissions and rotation of every token). One typed place says, for each token a plugin
takes, which layers hold it and what it must and must not be able to do there.

## Problem

`PluginToken.expect` (#2140) was a Cloudflare-only map of layer to permission to rule, with no way to say that a layer
holds a token without permission rules, and every reader walked the map itself.

## Decision

The declaration lives in the plugin's `tokens` export (`PluginToken.expect`), beside `envName`, `vendorEnvName` and
`keyringKey`, which already say where a token is looked up. It is not a `.holocron/` area: the permissions are a fact
about the plugin's code (what it calls), not about one repository, so they ship with the plugin and cannot drift from
it. A repository that needs to differ would be a later, narrower override, not the default.

```ts
type PermissionRule = "required" | "absent";

interface TokenExpectation {
  /** Layers that hold the token with no permission rules (rotation-only). Default: the layers `permissions` names. */
  layers?: readonly EnvironmentLayer[]; // "local" | "dev" | "ci" | "prod"
  /** Per layer, each permission (the plugin's own name) and its rule. */
  permissions?: Partial<Record<EnvironmentLayer, Record<string, PermissionRule>>>;
}

interface PluginToken {
  // ...envName, vendorEnvName, keyringKey, ...
  expect?: TokenExpectation;
}
```

One reader, exported from `@theholocron/cli`, is how everything else reads it:

```ts
tokenExpectations(tokens: readonly PluginToken[], filter?: { layer?: string; envName?: string }): LayerTokenExpectation[];
// { envName, layer, rules, required: string[], absent: string[] }, one per token and layer that holds it,
// in the order local, dev, ci, prod
```

The token probes (`probe <provider> token --environment <layer>`), the later `doctor` entry and the docs check
(`docs tokens` comparing the table in `tokens.mdx`) call `tokenExpectations()` and never read `expect` directly. A layer
no token holds yields no entry, which a probe reports as "no expectations declared".

## Not decided here

Rotation age, the `doctor` entry's name and a scheduled run stay with #2147 and their own issues.
