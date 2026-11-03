---
id: SPEC-0065
status: proposed
issue: theholocron/holocron#1595
blocked-by: []
related:
  - theholocron/holocron#1160
  - theholocron/holocron#1582
  - theholocron/holocron#1100
discussion:
  url: https://discord.com/channels/1303969001822486568/1567214024330973367
---

# Sentinel-hosted role sync

## Problem

`holocron notifications sync-roles` keeps a server role equal to a GitHub team, but someone has to run it. A person who joins the team gets the role only after a maintainer remembers to run the command.

## Design

Sentinel runs the same sync when GitHub says a team changed. The CLI and Sentinel are two adapters over one function: `syncRoles()` (and the checks in front of it: `roleTeamProblem`, `sourceProblem`, `readLinks`) in `@theholocron/cli`. What counts as in sync, that a holder nobody has linked is never removed, and how a step failure is recorded cannot differ between them.

### Choices (all small and reversible)

- **Trigger.** Two webhook events, both org-level: `membership` with `scope: team` and action `added` or `removed`, and `organization` with action `member_removed` (leaving the org drops a person off every team without a `membership` delivery per team). A team event syncs only the roles that follow that team; an org event syncs every role that follows a team. Nothing else triggers it, and there is no schedule: a missed delivery is repaired by redelivering it in the App's "Recent deliveries", or by running the CLI.
- **Where the layout comes from.** The default branch of one configured repo (`SENTINEL_ROLE_SYNC_REPO`, `owner/repo`), read through the installation with the existing `validateConfig()` (default branch only, as every Sentinel read). The first `discord` entry of its `notifications` providers gives the guild, the layout and its `roles[].team`. The repo's owner must equal the delivery's org, so an installation on another org does nothing.
- **Secrets.** Off unless all three are set in Sentinel's environment: `SENTINEL_ROLE_SYNC_REPO`, `HOLOCRON_DISCORD_BOT_TOKEN` (the Holonet bot) and `HOLOCRON_USER_SYNC_TOKEN` (the `github.user-sync` token that reads the links file in `.github-private`). Teams are listed with the installation's own token. These names are the ones the CLI reads, so `holocron secrets sync` fans them out from the same vault entries. Unset is a quiet `skipped`, not an error.
- **Idempotency.** The sync probes first and only changes the difference, so a redelivered or overlapping webhook changes nothing the first did not. No lock and no stored state.
- **Failure.** A sync that cannot run or only partly works answers HTTP 500 with the reason and logs an error line (Axiom). GitHub then shows the delivery as failed and offers redelivery. A provider error never throws out of the handler. Nothing is posted to Discord about a failure (follow-up).
- **Dry run and `--keep`.** Not offered here: Sentinel always gives and takes. Previewing stays a CLI thing.
- **Only Discord.** The provider is built from the `discord` plugin and the `github` source; another notifications provider needs its own factory in `load-role-sync-providers`.

### Not changed here

Sentinel's deployment, its environment values and the GitHub App's permissions and event subscriptions are set by hand (see the Sentinel README): the App needs organization permission Members: read and the `membership` and `organization` events. Sentinel is currently down (#1100), so none of this runs until it is back.

## Alternatives not taken

- A GitHub Actions workflow on a schedule: needs no App change, but is not triggered by the change and needs the Discord token as a repo secret.
- Posting a failed sync to #alerts: the logged error and the failed delivery are enough to start with.
