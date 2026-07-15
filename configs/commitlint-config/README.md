<!-- editorconfig-checker-disable-file -->

# CommitLint Config

A [CommitLint configuration](https://commitlint.js.org/reference/configuration.html#shareable-configuration) for writing well-formatted and consistent Git commits.

## Installation

```bash
pnpm add -D @theholocron/commitlint-config @commitlint/cli
```

`@commitlint/cli` is required to run commitlint directly (e.g., in git hooks or CI). `@commitlint/config-conventional` is a peer dependency resolved automatically by your package manager.

## Usage

In your project `commitlint.config.js`:

```javascript
export default {
  extends: ["@theholocron/commitlint-config"],
};
```

## Rules

### `type-enum`

Type must be one of: `build`, `ci`, `chore`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

```sh
echo "foo: some message" | commitlint   # fails
echo "fix: some message" | commitlint   # passes
```

### `type-case` — lowercase

```sh
echo "FIX: some message" | commitlint   # fails
echo "fix: some message" | commitlint   # passes
```

### `type-empty` — never empty

```sh
echo ": some message" | commitlint      # fails
echo "fix: some message" | commitlint   # passes
```

### `scope-case` — lowercase

```sh
echo "fix(SCOPE): message" | commitlint  # fails
echo "fix(scope): message" | commitlint  # passes
```

### `subject-case` — not sentence-case, start-case, pascal-case, or upper-case

```sh
echo "fix(scope): Some message" | commitlint   # fails
echo "fix(scope): some message" | commitlint   # passes
```

### `subject-empty` — never empty

```sh
echo "fix:" | commitlint               # fails
echo "fix: some message" | commitlint  # passes
```

### `subject-full-stop` — no trailing period

```sh
echo "fix: some message." | commitlint  # fails
echo "fix: some message" | commitlint   # passes
```

### `header-max-length` — 72 characters max

```sh
echo "fix: a very long message that exceeds the limit by quite a few characters" | commitlint  # fails
echo "fix: some message" | commitlint                                                           # passes
```
