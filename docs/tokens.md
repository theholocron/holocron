# Token reference

The token reference lives on the docs site, in one place: <https://docs.theholocron.dev/holocron/tokens/>. Its source is [`docs/src/content/docs/tokens.mdx`](src/content/docs/tokens.mdx).

This file is only a pointer, so links to `docs/tokens.md` from the code, the plugin READMEs and the specs keep working. A test (`packages/cli/src/auth/token-docs.test.ts`) fails when a plugin resolves a token that the page does not document.
