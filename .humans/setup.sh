#!/usr/bin/env bash
# Sets up a development environment for this repo on a fresh clone: Homebrew packages, Node, pnpm, git identity, the
# dependency install and the build that makes the `holocron` CLI exist. Safe to run again; it only changes what is
# missing. `doctor` changes nothing and reports what is missing.
#
#   ./.humans/setup.sh           set everything up
#   ./.humans/setup.sh doctor    report only
set -uo pipefail

CHECK=0
case "${1:-}" in
	"") ;;
	doctor) CHECK=1 ;;
	-h | --help)
		sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
	*)
		echo "unknown command: $1 (try --help)" >&2
		exit 2
		;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

failed=()
manual=()

ok() { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad() {
	printf '  \033[31m✗\033[0m %s\n' "$1"
	failed+=("$1")
}
todo() {
	printf '  \033[33m→\033[0m %s\n' "$1"
	manual+=("$1")
}
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# The strictest `engines.node` minimum in the workspace, so the version needed is never written down twice.
node_minimum() {
	find . -maxdepth 4 -name package.json -not -path '*/node_modules/*' -print0 |
		xargs -0 grep -h '"node": ">=' 2>/dev/null |
		sed -E 's/.*">=([0-9.]+)".*/\1/' |
		sort -V | tail -1
}

version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

step "Homebrew packages"
# `brew bundle` would install a second copy of a tool that is already on the PATH from somewhere else, so a Brewfile line
# is installed only when its command is missing: `brew "gh"` is the command gh, `cask "x" # bin: y` is the command y.
missing=()
while IFS= read -r line; do
	case "$line" in
		brew\ \"* | cask\ \"*) ;;
		*) continue ;;
	esac
	kind="${line%% *}"
	name="${line#*\"}"
	name="${name%%\"*}"
	bin="$name"
	case "$line" in *"# bin: "*) bin="${line##*# bin: }" ;; esac
	if have "$bin"; then ok "$bin"; else missing+=("$kind:$name"); fi
done <.humans/Brewfile

if [ "${#missing[@]}" -eq 0 ]; then
	:
elif [ "$(uname -s)" != "Darwin" ]; then
	todo "Not macOS: install ${missing[*]#*:} with your package manager (see .humans/Brewfile)."
elif ! have brew; then
	bad "Homebrew is not installed, and ${missing[*]#*:} are missing. Install it from https://brew.sh, then run this again."
elif [ "$CHECK" -eq 1 ]; then
	bad "not installed: ${missing[*]#*:} (run ./.humans/setup.sh to install them)"
else
	for entry in "${missing[@]}"; do
		flag=()
		[ "${entry%%:*}" = "cask" ] && flag=(--cask)
		if brew install ${flag[@]+"${flag[@]}"} "${entry#*:}"; then ok "installed ${entry#*:}"; else bad "brew install ${entry#*:} failed"; fi
	done
fi

step "Node and pnpm"
need="$(node_minimum)"
if ! have node; then
	bad "node is not installed. Install Node ${need:-22} or newer (for example with n, nvm or fnm)."
else
	have_node="$(node -p 'process.versions.node')"
	if [ -n "$need" ] && ! version_at_least "$have_node" "$need"; then
		bad "node $have_node is older than the $need the workspace needs. Upgrade Node (for example: n $need)."
	else
		ok "node $have_node"
	fi
	if have pnpm; then
		ok "pnpm $(pnpm --version 2>/dev/null)"
	elif [ "$CHECK" -eq 1 ]; then
		bad "pnpm is not available (run ./.humans/setup.sh to enable it with corepack)"
	elif have corepack && corepack enable >/dev/null 2>&1 && have pnpm; then
		ok "pnpm $(pnpm --version 2>/dev/null) (enabled with corepack)"
	else
		bad "pnpm is not available. Run: corepack enable"
	fi
fi

step "Git"
if [ -n "$(git config user.name)" ] && [ -n "$(git config user.email)" ]; then
	ok "git identity: $(git config user.name) <$(git config user.email)>"
else
	bad "git user.name and user.email are not set (commits are signed off with them: git commit -s)"
fi

step "Accounts"
if have gh && gh auth status >/dev/null 2>&1; then
	ok "gh is signed in"
else
	todo "Sign in to GitHub: gh auth login"
fi
if have op && op whoami >/dev/null 2>&1; then
	ok "op is signed in"
else
	todo "Turn on the 1Password CLI integration (1Password app > Settings > Developer > Integrate with 1Password CLI), then: op whoami"
fi

# Starlight ships TypeScript source and reaches `@astrojs/markdown-remark` (a dependency of `@astrojs/mdx`) only through
# pnpm's hoisted folder. An install made before the lockfile listed it keeps no link there, `pnpm install` finds nothing
# to do, and `astro-config`'s typecheck fails locally while CI, which installs fresh, passes (#1717). Only `--force`
# relinks it.
hoist_link=node_modules/.pnpm/node_modules/@astrojs/markdown-remark
stale_hoist() {
	grep -q "^  '@astrojs/markdown-remark@" pnpm-lock.yaml 2>/dev/null && [ -d node_modules/.pnpm ] && [ ! -e "$hoist_link" ]
}
stale_hoist_message="node_modules lacks the hoisted link that astro-config's typecheck needs (a stale install; CI is not affected)"

step "Dependencies and the holocron CLI"
if ! have pnpm; then
	bad "skipped: pnpm is not available"
elif [ "$CHECK" -eq 1 ]; then
	if [ -d node_modules ]; then ok "dependencies are installed"; else bad "pnpm install has not been run"; fi
	if stale_hoist; then bad "$stale_hoist_message; run ./.humans/setup.sh, or: pnpm install --force"; fi
	if [ -e cli/cli/dist ]; then ok "the CLI is built"; else bad "pnpm build has not been run"; fi
elif pnpm install --frozen-lockfile && pnpm build; then
	ok "installed and built; try: pnpm exec holocron --help"
	if stale_hoist; then
		if pnpm install --frozen-lockfile --force && ! stale_hoist; then ok "relinked the hoisted packages (pnpm install --force)"; else bad "$stale_hoist_message, and pnpm install --force did not fix it"; fi
	fi
else
	bad "pnpm install or pnpm build failed"
fi

printf '\n'
if [ "${#manual[@]}" -gt 0 ]; then
	echo "Still to do by hand:"
	printf '  - %s\n' "${manual[@]}"
fi
if [ "${#failed[@]}" -gt 0 ]; then
	echo "Needs attention:"
	printf '  - %s\n' "${failed[@]}"
	exit 1
fi
echo "Ready. Next: pnpm exec holocron doctor"
