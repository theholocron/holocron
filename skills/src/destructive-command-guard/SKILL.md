---
name: destructive-command-guard
title: Destructive Command Guard
description: Destructive command safety rules. INVOKE WHEN: about to run any Bash command that deletes, resets, drops, prunes, or truncates. Pairs with the dcg PreToolUse hook (https://github.com/Dicklesworthstone/destructive_command_guard).
---

# destructive-command-guard

These rules mirror what the `dcg` PreToolUse hook enforces at runtime. Follow them proactively so the hook is a safety net, not the first line of defense.

## Git — never run without explicit permission

| Blocked                               | Safer alternative               |
| ------------------------------------- | ------------------------------- |
| `git reset --hard`                    | `git stash` first, then reset   |
| `git clean -f` / `git clean -fd`      | `git clean -n` (dry run) first  |
| `git checkout -- .` / `git restore .` | Restore individual files only   |
| `git push --force` / `git push -f`    | `git push --force-with-lease`   |
| `git branch -D`                       | `git branch -d` (safe delete)   |
| `git rebase -i` with `drop`           | Confirm each drop with the user |

## Filesystem — never run without explicit permission

| Blocked                        | Safer alternative                      |
| ------------------------------ | -------------------------------------- |
| `rm -rf <dir>`                 | `trash <dir>` or move to `/tmp/`       |
| `find ... -delete`             | `find ... -print` first to verify      |
| `chmod -R 777`                 | Scope to specific files only           |
| `> file` (truncating redirect) | Confirm file contents before overwrite |
| `dd if=... of=/dev/...`        | Confirm target device explicitly       |

## Database — never run without explicit permission

| Blocked                        | Safer alternative                         |
| ------------------------------ | ----------------------------------------- |
| `DROP TABLE` / `DROP DATABASE` | Rename table first; drop after confirming |
| `TRUNCATE`                     | `DELETE WHERE ...` with a `WHERE` clause  |
| `DELETE` without `WHERE`       | Always require a `WHERE` clause           |

## Containers / infrastructure

| Blocked                       | Safer alternative                       |
| ----------------------------- | --------------------------------------- |
| `docker system prune`         | `docker container prune` (scope it)     |
| `kubectl delete namespace`    | Confirm namespace + context explicitly  |
| `terraform destroy`           | Require `--target` to scope the destroy |
| `aws ec2 terminate-instances` | Require explicit instance IDs, confirm  |

## Rule of thumb

If a command is irreversible and affects more than one file or row, **stop and ask** before running it. The user's confirmation costs seconds; accidental deletion costs hours.
