---
name: work-effort
title: Work Effort
description: How to choose --effort (high, medium or low) for holocron new work, new issue and start work. INVOKE WHEN: filing an issue or starting work with holocron new work, new issue or start work, or when asked how big a piece of work is. Invoked as /work-effort.
---

# Work effort

The organization's `Effort` issue field has three levels: **high**, **medium** and **low**. The CLI never
chooses one: `holocron new work`, `new issue` and `start work` take `--effort <high|medium|low>`, and an agent
passes it. This skill says how to pick it. Do not invent other levels, sizes or numbers.

## When to use

- You are about to run `holocron new work`, `holocron new issue` or `holocron start work`.
- You are asked how big, how long or how risky a piece of work is.
- An issue has the wrong Effort and you are about to change it with `holocron update issue --effort`.

## Who sets it

1. **The maintainer's ask wins.** If the ask names a size ("a quick fix", "this is a big one", "effort high"),
   use it and do not second-guess it.
2. **Otherwise you estimate it** when you file the issue, from the signals below. The estimate is a planning
   figure, not a promise.
3. **State the reason in one line**, with the command or in your reply, for example:
   `Effort medium: one command, one package, tests and docs, no new provider.`

## The levels in this repo

| Level      | What it looks like                                                                                                                             | Examples from merged work                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **low**    | A typo, a config line, a pin, a doc fix, one small bug with an obvious cause. One package, a few files, no behaviour to design.                | #2453, install a pinned gitleaks so the scan runs (4 files); #2458, record the registrar (docs only)                                                                                              |
| **medium** | One focused command, one provider method or one behaviour change, with its tests and docs. One or two packages, one pull request, no unknowns. | #2423, retry a Vercel deployment that fails its install (5 files); #2445, pull request methods on `Source` (11 files)                                                                             |
| **high**   | A capability that crosses packages, a new provider or plugin, anything that needs a spec, a stack of pull requests, or live-service unknowns.  | #2448, `start work` (cli, astromech and the GitHub plugin, 39 files); #2446, every issue field through `new issue` and `update issue` (66 files); the work commands as a whole, six pull requests |

## Signals to read from the ask

Count what you can see in the ask, then confirm with a quick look at the files it names.

| Signal                                                               | Pushes toward                                |
| -------------------------------------------------------------------- | -------------------------------------------- |
| One file or one line, no behaviour change                            | low                                          |
| One package, one function or command, with tests and docs            | medium                                       |
| Two or more packages (cli, a plugin, astromech, a client)            | medium or high                               |
| A new capability, a new provider or a new plugin package             | high                                         |
| A new or changed public type in `capabilities.type.ts`               | high                                         |
| Needs a spec (`--spec`), an ADR or a decision from the maintainer    | high                                         |
| A live service nobody has run against (a real API, a real server)    | high                                         |
| More than one pull request (a stack, or a spec then the code)        | high                                         |
| Mostly mechanical, even across many files (a rename, a version bump) | one level lower than the file count suggests |
| A bug whose cause is not known yet                                   | one level higher than the fix looks          |

When two signals disagree, take the higher level. A wrong high costs a larger estimate; a wrong low hides work.

## When to ask the maintainer

Ask, instead of guessing, when:

- the ask is one line and could be a config tweak or a new capability ("support Linear");
- the work might need a spec and you cannot tell without a decision;
- you would be choosing between low and high, so there is no sensible middle;
- the issue is for work in an area you do not know.

On a terminal `new work` and `new issue` ask for Effort when `--effort` is absent. Without a terminal, with
`--yes` or with `--dry-run` they do not, so an agent must pass it.

## Writing and changing it

- Set it when the issue is made: `holocron new work "<title>" --effort <level>` or
  `holocron new issue "<title>" --effort <level>`. `start work` sets it with the start date when you pass
  `--effort` and the run makes the branch.
- Change it later with `holocron update issue <key> --effort <level>` when the work shows it was mis-sized, and
  say why in one line. Do not leave a known-wrong estimate in place.
- A tracker with no Effort field, or with estimates off, reports the value as `not carried across`. That is not a failure.

## Non-negotiables

- Only `high`, `medium` and `low`. Never `critical`, `xl`, a number or a made-up level.
- Never overrule a size the maintainer gave.
- Always give the one-line reason.
- Never call a service to estimate: read the ask and the repo.

## Checklist

1. Is a size in the ask? Use it.
2. Otherwise count the signals: packages, new capability or provider, spec, live unknowns, pull requests.
3. Pick the level; when two signals disagree, take the higher.
4. If it is a coin toss between low and high, ask the maintainer.
5. Pass `--effort <level>` and state the reason in one line.
