---
id: SPEC-0066
status: proposed
issue: theholocron/holocron#1599
blocked-by: []
related:
  - theholocron/holocron#1160
  - theholocron/holocron#1582
discussion:
  url: https://discord.com/channels/1303969001822486568/1567217176358813729
---

# Checkly alert channels: more settings, and routing a check to chosen channels

## Problem

The alert channel `notifications setup` makes in Checkly always sends failure, recovery and degraded notices, and is
subscribed to every check on the account. Two things cannot be declared: what the channel alerts about beyond those
three (Checkly also sends SSL-certificate-expiry alerts), and which alert channel a given check alerts through, so a
noisy check cannot be kept out of `#uptime` or sent to a second channel.

## Decision

Both live in `holocron.config`, in the two places that already own the thing:

- **Alert settings** belong to the alert channel, which the notification layout declares as `feeds.monitoring`. The
  object form gains `alerts`:

  ```ts
  feeds: { monitoring: { alerts: { failure: true, recovery: true, degraded: false, sslExpiry: true, sslExpiryThreshold: 14 } } }
  ```

  Every field is optional. On a new channel a field left out takes the default (`failure`, `recovery`, `degraded` on,
  `sslExpiry` off). On an existing channel a field left out is **left alone**, a field given is put back if it differs
  (`updated` reports `alerts`). This matches how the config treats every other setting: it compares only what it states.

- **Routing** belongs to the check, which the `monitoring` provider's `checks` list declares. A check gains
  `alertChannels: string[]`, the names of alert channels (`feeds.monitoring.name`, `Message to #<channel>` by default).
  A check that names none alerts through every alert channel, as today; a check that names some is subscribed to those
  only. A check the config does not declare (one made by hand in Checkly) is not subject to routing: it alerts through every
  alert channel, as it always has, and `setup` does not unsubscribe it. An empty `alertChannels` is the same as none.
  Names are compared without regard to case, in `setup`, the provider and the doctor alike.

`Monitoring.inspectAlertChannel` returns the channel's current `alerts`, and `misrouted` (checks it is still subscribed to
though they are routed away). `unsubscribed` and `deactivated` count only the checks routed to the channel.
`doctor notifications` (the home of the alert channel's checks) compares each alert setting the layout states and fails
for a misrouted subscription, and for a channel that alerts for check groups while some check is routed away from it (a
group's subscription alerts for every check in it, and the client cannot read which checks a group holds, so the doctor
names the count and leaves the checking to a person). `notifications setup` refuses, before anything is created, a check routed to an alert
channel name no `feeds.monitoring` declares, including when the layout declares no `feeds.monitoring` at all.

When a channel must be replaced (a new URL, template or alert setting) Checkly's update replaces the whole channel. The
settings the config does not state go back as a read taken just before the update has them, and every subscription
that read holds is checked after it; one Checkly will not take back fails `setup`. A subscription added in the instant
between that read and the update cannot be kept, which the API gives no way to prevent.

## Choices to review

- Settings are on the feed, routing on the check, not one block in either place: each is declared where its owner already
  lives and neither needs the other's file to read.
- `setup` only adds subscriptions. It does not remove a subscription from a channel a check was later routed away from:
  Checkly's replace-the-channel call was seen not to apply subscription lists reliably, and the client has no
  unsubscribe call. `doctor notifications` reports it, naming the check, and the subscription is removed in Checkly.
- `doctor monitoring` stays about the checks themselves; the alert channel stays `doctor notifications`'s, as before.
- No client change: `@theholocron/checkly-client` already carries `sendFailure`, `sendRecovery`, `sendDegraded`,
  `sslExpiry` and `sslExpiryThreshold`, so no release of it and no `peers` floor move.
