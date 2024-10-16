# Lint Staged Config

A [Lint Staged configuration](https://github.com/okonet/lint-staged#configuration) for linting code that has been staged in Git within the Galaxy.

## Installation

```bash
npm install --save-dev @theholocron/lint-staged-config
```

## Usage

In your project `.husky/pre-commit` add the following:

```bash
# .husky/pre-commit
npx lint-staged --config @theholocron/lint-staged-config
```

## How We Manage Git Hooks

This library uses [husky](https://github.com/typicode/husky) for managing Git hooks and extends that with `lint-staged`.  This means we can run automated tasks on any file that is placed on the Git stage.  Currently that means we run the following commands on various types of code:

### [TJ]S(X)

First we run all suffixed files through `prettier` with the `--write` flag in order to format and fix all style issues.

Then we use `eslint` to check for any glaring code issues.

Lastly, we run it through `tsc` in order to check for any type errors.

If all things pass, then you'll proceed to commit.

### (S)CSS

We use `stylelint` with the `--fix` flag on any staged files.

### Images

We run `imagin-lint-staged` in order to compress any images that may show up on the staging area in order to reduce the size.
