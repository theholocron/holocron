# Token reference

The token reference lives on the docs site, in one place: <https://docs.theholocron.dev/holocron/tokens/>. Its source is [`docs/src/content/docs/tokens.mdx`](src/content/docs/tokens.mdx).

This file is only a pointer, so links to `docs/tokens.md` from the code, the plugin READMEs and the specs keep working. A test (`packages/cli/src/auth/token-docs.test.ts`) fails when a plugin resolves a token that the page does not document.

## Where the old sections went

| Old section                                                       | Now                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Resolution chain, Feature tokens                                  | [GitHub tokens](https://docs.theholocron.dev/holocron/tokens/#github-tokens)                                 |
| Setting tokens via env vars, Storing tokens in the keyring        | [Storing tokens in the keyring](https://docs.theholocron.dev/holocron/tokens/#storing-tokens-in-the-keyring) |
| CI secrets                                                        | [CI secrets](https://docs.theholocron.dev/holocron/tokens/#ci-secrets)                                       |
| Org-scoped secret writes                                          | [Organization secrets](https://docs.theholocron.dev/holocron/tokens/#organization-secrets)                   |
| CI-only exception: GitHub Deployments, Provisioning the CI tokens | [CI-only tokens](https://docs.theholocron.dev/holocron/tokens/#ci-only-tokens)                               |
| Third-party provider tokens (Fern, Vercel, Doppler)               | [Provider tokens](https://docs.theholocron.dev/holocron/tokens/#provider-tokens)                             |
