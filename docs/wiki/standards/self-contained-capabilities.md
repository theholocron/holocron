# Self-contained capabilities

Some capabilities are cross-cutting infrastructure — active everywhere the relevant
env vars are present, regardless of whether a provider entry exists in
`holocron.config`. These are called **self-contained capabilities**.

## Why this exists

Most capabilities (`source`, `deployment`, `vault`, etc.) are opt-in features:
you choose a provider, add it to config, and it activates. This makes sense for
things like "which database do I use" — not every repo needs one.

Observability is different. Error tracking and log aggregation should be active
wherever the tooling is running — including repos with no `holocron.config`, CI
pipelines that run before config is fully resolved, and environments provisioned
by `holocron setup` itself. Making them config-gated creates a chicken-and-egg
problem: you want errors and logs from the config-loading phase.

## The pattern

Self-contained capabilities are **env-var-activated**. The runtime checks for
specific env vars at startup and activates the capability immediately, before
any config is loaded:

| Capability | Provider | Env vars that activate it |
|---|---|---|
| `errors` | `sentry` | `SENTRY_DSN` |
| `logs` | `axiom` | `AXIOM_TOKEN` + `AXIOM_DATASET` |

The provider entry in `holocron.config` serves a separate, optional purpose:

```ts
providers: {
  errors: ["sentry", { org: "my-org" }],
  logs: "axiom",
}
```

| What it enables | Without the entry |
|---|---|
| `holocron setup` provisions the Sentry project / Axiom dataset | Must provision manually |
| `holocron doctor` checks connectivity | Check skipped |
| Runtime activation | **Unaffected — env vars alone are sufficient** |

This means `errors` and `logs` work in any repo — including repos with no
`holocron.config` — as long as the env vars are set as org secrets.

## Opting out

Remove the env vars. If `SENTRY_DSN` is absent, `errors` is inactive. If
`AXIOM_TOKEN` or `AXIOM_DATASET` is absent, `logs` is inactive. No config
change required.

Additionally, `HOLOCRON_TELEMETRY=false` disables the `logs` Axiom transport
while leaving local logging intact — useful when running offline or in an
environment where outbound network calls should be suppressed.

## Contrast with standard capabilities

| | Standard capability | Self-contained capability |
|---|---|---|
| **Activation gate** | Provider entry in config | Env var present at startup |
| **Works without config file** | No | Yes |
| **Purpose of config entry** | Activation + setup | Setup + doctor only |
| **Opt-out** | Remove config entry | Remove env var |
| **Examples** | `deployment`, `vault`, `storage` | `errors`, `logs` |

## Adding a new self-contained capability

A capability should be self-contained when:

1. It is cross-cutting infrastructure, not a feature choice
2. It needs to be active before or during config resolution
3. Its absence does not break the CLI — it degrades gracefully

If any of these are false, use the standard provider model instead.
