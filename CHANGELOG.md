## [5.0.0-alpha.374](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.373...v5.0.0-alpha.374) (2026-11-08)

### Bug Fixes

* **kyber:** 🐛 keep the first plugin built for a provider several capabilities name ([#1941](https://github.com/theholocron/holocron/issues/1941)) ([8eaf359](https://github.com/theholocron/holocron/commit/8eaf35999aa011043930343c9a6fca2d8053f356))

## [5.0.0-alpha.373](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.372...v5.0.0-alpha.373) (2026-11-08)

### Features

* **cli:** 🔌 run a provider's setup and doctor without a config entry ([#1938](https://github.com/theholocron/holocron/issues/1938)) ([8e2c5d7](https://github.com/theholocron/holocron/commit/8e2c5d7a3c979b2d5fa1a5287962a04f1667cce2)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)
* **linear:** apply and compare git automation rules, validate issue templates ([#1930](https://github.com/theholocron/holocron/issues/1930)) ([becf6ed](https://github.com/theholocron/holocron/commit/becf6ed6bd9561714f6e9c46dd4fc50c3126c871)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)
* **migrate:** put a migrated board's issues on a GitHub board ([#1933](https://github.com/theholocron/holocron/issues/1933)) ([78dcb40](https://github.com/theholocron/holocron/commit/78dcb405c9fb15b04450cdd7e0d99c84643c854d)), closes [#1860](https://github.com/theholocron/holocron/issues/1860)

### Bug Fixes

* **ci:** 🔧 name Sentinel's preview script deploy:preview and guard against the hyphen spelling ([#1932](https://github.com/theholocron/holocron/issues/1932)) ([142f31f](https://github.com/theholocron/holocron/commit/142f31fe2a86ef31258e44d9596a49d9cac885fe)), closes [#1929](https://github.com/theholocron/holocron/issues/1929)
* **kyber:** start the CLI runner's hang clock when node runs, not at the spawn ([#1931](https://github.com/theholocron/holocron/issues/1931)) ([986a02f](https://github.com/theholocron/holocron/commit/986a02ff9dc6082498fc6e904541fb0c7ea112fd)), closes [#1902](https://github.com/theholocron/holocron/issues/1902)
* **sentinel:** 📦 declare kyber and json-utils so deploy stage can stage the bundle ([#1939](https://github.com/theholocron/holocron/issues/1939)) ([587aa23](https://github.com/theholocron/holocron/commit/587aa23bc274b951545ef56c0ae7ebee39a53a13)), closes [#1929](https://github.com/theholocron/holocron/issues/1929)

### Documentation

* file the issue and spec in the issues provider's tracker ([#1935](https://github.com/theholocron/holocron/issues/1935)) ([6ae1860](https://github.com/theholocron/holocron/commit/6ae1860a187fc9daf0e0ad962edff878b17f8512)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)
* **linear:** 📝 say what permissions the Linear key needs, as a table ([#1936](https://github.com/theholocron/holocron/issues/1936)) ([c9102c6](https://github.com/theholocron/holocron/commit/c9102c6b4ca6d01cdacf26a3d14c1b5fd4cffc36)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)

## [5.0.0-alpha.372](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.371...v5.0.0-alpha.372) (2026-11-08)

### Bug Fixes

* **plugins:** 🔇 hide link previews in the pull-request feed forum ([#1926](https://github.com/theholocron/holocron/issues/1926)) ([b417ab4](https://github.com/theholocron/holocron/commit/b417ab4c407f6dc995f6f1e052d17aabc35b7e7c)), closes [#1738](https://github.com/theholocron/holocron/issues/1738)

## [5.0.0-alpha.371](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.370...v5.0.0-alpha.371) (2026-11-08)

### Features

* **env:** 🏷️ read the Holocron-owned variables as HOLOCRON_<NAME> first ([#1911](https://github.com/theholocron/holocron/issues/1911)) ([683311c](https://github.com/theholocron/holocron/commit/683311cb5e9b59dc8821b9b9a43fa1bef32a1c32)), closes [#1864](https://github.com/theholocron/holocron/issues/1864) [#1727](https://github.com/theholocron/holocron/issues/1727)

### Bug Fixes

* **1password:** 🐛 list an Environment's variable names when the vault is an Environment ([#1928](https://github.com/theholocron/holocron/issues/1928)) ([97e0c99](https://github.com/theholocron/holocron/commit/97e0c99f0358f6e9da9a5360b470d56aee68d93c)), closes [#1863](https://github.com/theholocron/holocron/issues/1863)
* **vitest-config:** 🐛 give process-spawning tests a budget that survives a loaded machine ([#1924](https://github.com/theholocron/holocron/issues/1924)) ([c868060](https://github.com/theholocron/holocron/commit/c86806095b9c4011ce82500f66c1cc32e9e115b2)), closes [#1903](https://github.com/theholocron/holocron/issues/1903)

### Documentation

* **env:** 📚 list every environment variable by group and map the workflows onto the prefixed names ([#1913](https://github.com/theholocron/holocron/issues/1913)) ([e6e4902](https://github.com/theholocron/holocron/commit/e6e490263753d1397b26e7ae59824f8e4c2aaebd)), closes [#1864](https://github.com/theholocron/holocron/issues/1864) [#1864](https://github.com/theholocron/holocron/issues/1864) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **sentinel:** 📝 say which Environment holocron dev passes to the app ([#1927](https://github.com/theholocron/holocron/issues/1927)) ([bbabb99](https://github.com/theholocron/holocron/commit/bbabb994f270a062a745c9ee97425b4b96521124)), closes [#prs](https://github.com/theholocron/holocron/issues/prs)

## [5.0.0-alpha.370](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.369...v5.0.0-alpha.370) (2026-11-07)

### Features

* **cli:** ✨ add holocron provider and Linear setup and doctor ([#1916](https://github.com/theholocron/holocron/issues/1916)) ([2005e2f](https://github.com/theholocron/holocron/commit/2005e2f5e65bd99a4759a188632b914958529350)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)
* **plugins:** ✨ add a Linear plugin and `holocron migrate` between trackers ([#1857](https://github.com/theholocron/holocron/issues/1857)) ([9996268](https://github.com/theholocron/holocron/commit/9996268d92a5cb2b05bc3432f524ebef49088e79)), closes [#1856](https://github.com/theholocron/holocron/issues/1856) [#1856](https://github.com/theholocron/holocron/issues/1856)

### Chores

* **deps:** bump @semantic-release/git from 10.0.1 to 11.0.1 ([#1921](https://github.com/theholocron/holocron/issues/1921)) ([a448298](https://github.com/theholocron/holocron/commit/a448298d5c3d0d9679e4be7c898eadd67a50980c))
* **deps:** bump ora from 9.4.1 to 10.0.0 ([#1923](https://github.com/theholocron/holocron/issues/1923)) ([036565a](https://github.com/theholocron/holocron/commit/036565ae639df4a7ee19c8de8c825c2c5468b5aa))
* **deps:** bump the all-dependencies group with 7 updates ([#1919](https://github.com/theholocron/holocron/issues/1919)) ([eb958cf](https://github.com/theholocron/holocron/commit/eb958cfb3595d63d90bb46640f5e44e856e0702b))

## [5.0.0-alpha.369](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.368...v5.0.0-alpha.369) (2026-11-07)

### Features

* **sentinel:** ✨ [#prs](https://github.com/theholocron/holocron/issues/prs) post titled repo#N: title, with the description and no Sourcery ([#1918](https://github.com/theholocron/holocron/issues/1918)) ([8c8b1a6](https://github.com/theholocron/holocron/commit/8c8b1a66f7ee688a0d9c3777437deacb1f957a46))

## [5.0.0-alpha.368](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.367...v5.0.0-alpha.368) (2026-11-07)

### Features

* **env:** 🏷️ share one HOLOCRON prefix and a prefix option on resolveValue ([#1909](https://github.com/theholocron/holocron/issues/1909)) ([9cae3f1](https://github.com/theholocron/holocron/commit/9cae3f18025987d44ba3c3d81a36c2da7d9aa053)), closes [#1864](https://github.com/theholocron/holocron/issues/1864) [#1727](https://github.com/theholocron/holocron/issues/1727)

### Bug Fixes

* **sentinel:** 🖼️ skip svg and tiff pictures in the config fetch, document the skip ([#1914](https://github.com/theholocron/holocron/issues/1914)) ([f423564](https://github.com/theholocron/holocron/commit/f423564cf1c7bf037f518a0a5f0a81f64fc31533)), closes [#1906](https://github.com/theholocron/holocron/issues/1906)

## [5.0.0-alpha.367](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.366...v5.0.0-alpha.367) (2026-11-07)

### Bug Fixes

* **secrets:** 🔑 skip GitHub-invalid secret names instead of a bare 422 ([#1908](https://github.com/theholocron/holocron/issues/1908)) ([b15c6f2](https://github.com/theholocron/holocron/commit/b15c6f2cb14ab2c738d733f0413f6d6533edba73)), closes [#1907](https://github.com/theholocron/holocron/issues/1907)

## [5.0.0-alpha.366](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.365...v5.0.0-alpha.366) (2026-11-07)

### Features

* **auth:** ✨ a token can carry its own check, and the Discord bot token does ([#1905](https://github.com/theholocron/holocron/issues/1905)) ([c8bb003](https://github.com/theholocron/holocron/commit/c8bb003247d3ca484df607a6deefc3d8e5f34bb6))

### Bug Fixes

* **sentinel:** 🖼️ leave pictures out of the config directory fetch ([#1906](https://github.com/theholocron/holocron/issues/1906)) ([1927c55](https://github.com/theholocron/holocron/commit/1927c55524c851fdbca0b01830a8704fd4afb093))

## [5.0.0-alpha.365](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.364...v5.0.0-alpha.365) (2026-11-07)

### Bug Fixes

* **axiom:** 🔑 verify an API token that cannot read the user ([#1904](https://github.com/theholocron/holocron/issues/1904)) ([cfcc4a4](https://github.com/theholocron/holocron/commit/cfcc4a4edd42c8c028ebe84c26ee399ef34cc9fd))

## [5.0.0-alpha.364](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.363...v5.0.0-alpha.364) (2026-11-07)

### Bug Fixes

* **doctor:** 🔍 doctor tokens finds a token where the plugins do ([#1899](https://github.com/theholocron/holocron/issues/1899)) ([bae635b](https://github.com/theholocron/holocron/commit/bae635be140d49ecf9b9ce007325ce79b3557830))

### Refactoring

* **astromech:** ♻️ one source for the release branches and prerelease channel ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1894](https://github.com/theholocron/holocron/issues/1894)) ([1d1be70](https://github.com/theholocron/holocron/commit/1d1be707daf2a838f2b5a3094bc352e687427730))
* **config:** ♻️ one source for the org slug and .github coordinates ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1897](https://github.com/theholocron/holocron/issues/1897)) ([2e767a5](https://github.com/theholocron/holocron/commit/2e767a531c5465a58bcfab47d24e452e153afe3f))

### Documentation

* **specs:** 📝 add labels and issue templates to the provider setup spec ([#1901](https://github.com/theholocron/holocron/issues/1901)) ([5b26567](https://github.com/theholocron/holocron/commit/5b265673b2f32d6091dc839ddec2163f7bc051d2))

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1896](https://github.com/theholocron/holocron/issues/1896)) ([0c28235](https://github.com/theholocron/holocron/commit/0c282356a19d6147fb656f40b75bf31af83f975f))

## [5.0.0-alpha.363](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.362...v5.0.0-alpha.363) (2026-11-07)

### Features

* **repo:** ✨ doctor flags capabilities the org property lacks, `repo properties apply` adds them ([#1873](https://github.com/theholocron/holocron/issues/1873)) ([d359f55](https://github.com/theholocron/holocron/commit/d359f559709b32544bccb28a8d832e555f066f7e)), closes [#1862](https://github.com/theholocron/holocron/issues/1862) [#1862](https://github.com/theholocron/holocron/issues/1862)

### Bug Fixes

* **sentinel:** 🔁 read SENTINEL_AXIOM_DATASET first, then AXIOM_DATASET ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1882](https://github.com/theholocron/holocron/issues/1882)) ([4c9c7a5](https://github.com/theholocron/holocron/commit/4c9c7a55d05426565ee612bb3a0933029abae8e4))

### Refactoring

* **config:** ♻️ one default domain in the presets and sync-wiki ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1889](https://github.com/theholocron/holocron/issues/1889)) ([dc43f36](https://github.com/theholocron/holocron/commit/dc43f363ef0679eee780e41b32b4ea792850ed37)), closes [#1884](https://github.com/theholocron/holocron/issues/1884)
* **kyber:** 🔒 read env through env-utils/lookup in kyber and observability ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1891](https://github.com/theholocron/holocron/issues/1891)) ([ac58fb8](https://github.com/theholocron/holocron/commit/ac58fb879998a5504890ebf049c5d7b1d82ec1e7)), closes [#1890](https://github.com/theholocron/holocron/issues/1890)

## [5.0.0-alpha.362](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.361...v5.0.0-alpha.362) (2026-11-07)

### Bug Fixes

* **config:** 🔑 read the Holocron 1Password Environment from Sentinel and Comlink ([#1881](https://github.com/theholocron/holocron/issues/1881)) ([3727476](https://github.com/theholocron/holocron/commit/3727476e02680c3a0956e2c881e8fc64022df40d)), closes [#1678](https://github.com/theholocron/holocron/issues/1678)

### Chores

* **ci:** 🔧 use per-service Axiom dataset variables ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1875](https://github.com/theholocron/holocron/issues/1875)) ([b264d43](https://github.com/theholocron/holocron/commit/b264d43bea3c0b3138dd40375dac3ce8ce7575ff))

## [5.0.0-alpha.361](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.360...v5.0.0-alpha.361) (2026-11-07)

### Features

* **config:** 🌐 spell the org's domain once, in .holocron/org.ts ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1878](https://github.com/theholocron/holocron/issues/1878)) ([390ffe2](https://github.com/theholocron/holocron/commit/390ffe26a29d3a6c92f3ed82ca8a2476268e8263))

### Bug Fixes

* **cli:** 🔍 show the provider's own message when tunnel up or dev fails ([#1880](https://github.com/theholocron/holocron/issues/1880)) ([8d23d2e](https://github.com/theholocron/holocron/commit/8d23d2e0186cb19feb108b0aae334122e022e5ac)), closes [#1678](https://github.com/theholocron/holocron/issues/1678)
* **sentinel:** 🔑 list the organization Projects permission in the App manifest ([#1879](https://github.com/theholocron/holocron/issues/1879)) ([4e97e55](https://github.com/theholocron/holocron/commit/4e97e55d6443af2a10bb0d30aac71432f9a51b02)), closes [#1744](https://github.com/theholocron/holocron/issues/1744)

### Refactoring

* **logging:** ♻️ one Axiom dataset per service, split by the env tag ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1870](https://github.com/theholocron/holocron/issues/1870)) ([7e238d8](https://github.com/theholocron/holocron/commit/7e238d8bbd5b50e8ae70d2b3670f86a88cc4a266)), closes [#1865](https://github.com/theholocron/holocron/issues/1865)

### Chores

* **env:** 🔒 read env through env-utils lookup, enable noProcessEnv ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1872](https://github.com/theholocron/holocron/issues/1872)) ([25ba866](https://github.com/theholocron/holocron/commit/25ba8667d1054686edb17ce3ceea0c82f8236ac7))

## [5.0.0-alpha.360](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.359...v5.0.0-alpha.360) (2026-11-07)

### Features

* **doctor:** 🩺 holocron doctor github-app checks an App against its manifest ([#1854](https://github.com/theholocron/holocron/issues/1854)) ([81247cf](https://github.com/theholocron/holocron/commit/81247cf307d27d0f9c780a009b155a934de88fc7)), closes [#1851](https://github.com/theholocron/holocron/issues/1851) [#1851](https://github.com/theholocron/holocron/issues/1851)

### Bug Fixes

* **ci:** 🔧 pass the Vercel team id to monitoring run-resolved ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1867](https://github.com/theholocron/holocron/issues/1867)) ([faa6751](https://github.com/theholocron/holocron/commit/faa675173a57f851641ce8f913efde6fb2b775f1))

### Refactoring

* **config:** ♻️ derive Sentinel and Comlink hostnames from the one domain ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1869](https://github.com/theholocron/holocron/issues/1869)) ([b76daf5](https://github.com/theholocron/holocron/commit/b76daf5727d37c0427b88c2066f79234b7aadb2c))

### Documentation

* **specs:** 📝 propose provider setup, Linear automation and one-way issue syncs ([#1861](https://github.com/theholocron/holocron/issues/1861)) ([d5f6a0b](https://github.com/theholocron/holocron/commit/d5f6a0b01bb7d823c71e540e3b8c63eeb5d560e0)), closes [#1859](https://github.com/theholocron/holocron/issues/1859) [#1860](https://github.com/theholocron/holocron/issues/1860)

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1876](https://github.com/theholocron/holocron/issues/1876)) ([8e4a5b9](https://github.com/theholocron/holocron/commit/8e4a5b954f86566c628d986605946f129b78e6f7))

## [5.0.0-alpha.359](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.358...v5.0.0-alpha.359) (2026-11-07)

### Features

* **doctor:** 🔑 doctor notifications checks the bot's server permissions and prints the invite link ([#1855](https://github.com/theholocron/holocron/issues/1855)) ([19fada6](https://github.com/theholocron/holocron/commit/19fada66f31fc905aa69cacadcb10fbb2a075d0a)), closes [#1853](https://github.com/theholocron/holocron/issues/1853) [#1853](https://github.com/theholocron/holocron/issues/1853)

### Bug Fixes

* **notifications:** 🐛 ask for Add Reactions when a forum has starter reactions ([#1852](https://github.com/theholocron/holocron/issues/1852)) ([a6ecb55](https://github.com/theholocron/holocron/commit/a6ecb5572c1fb6a4060f945b3df0b5b06dc3eb8b)), closes [#1822](https://github.com/theholocron/holocron/issues/1822) [#1822](https://github.com/theholocron/holocron/issues/1822)

## [5.0.0-alpha.358](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.357...v5.0.0-alpha.358) (2026-11-07)

### Features

* **notifications:** ⚙️ feeds.prs in the layout, setup and doctor ([#1842](https://github.com/theholocron/holocron/issues/1842)) ([f242101](https://github.com/theholocron/holocron/commit/f2421018030bd7c7386665b0bfa6c50dac9223d1)), closes [#prs](https://github.com/theholocron/holocron/issues/prs) [#1834](https://github.com/theholocron/holocron/issues/1834)
* **notifications:** 🧵 append, edit and de-duplicate posts in a forum thread ([#1841](https://github.com/theholocron/holocron/issues/1841)) ([750baaa](https://github.com/theholocron/holocron/commit/750baaa1fbf29a240a97d65f71a91fae3d2034a6)), closes [#1832](https://github.com/theholocron/holocron/issues/1832)
* **sentinel:** 📡 post a thread per pull request to the [#prs](https://github.com/theholocron/holocron/issues/prs) forum ([#1843](https://github.com/theholocron/holocron/issues/1843)) ([1b7a51e](https://github.com/theholocron/holocron/commit/1b7a51e4ba396e6d4778c867a715c77adf696cdb)), closes [#1833](https://github.com/theholocron/holocron/issues/1833)
* **sentinel:** 🧱 render a pull request's thread: summary, tag and CI message ([#1840](https://github.com/theholocron/holocron/issues/1840)) ([4459a74](https://github.com/theholocron/holocron/commit/4459a74d0d1b9f2bc4abb8882683cb976f7648a4)), closes [#prs](https://github.com/theholocron/holocron/issues/prs) [#1831](https://github.com/theholocron/holocron/issues/1831)

### Documentation

* **sentinel:** 📝 document the [#prs](https://github.com/theholocron/holocron/issues/prs) forum feed and subscribe the App to its events ([#1844](https://github.com/theholocron/holocron/issues/1844)) ([bdafc02](https://github.com/theholocron/holocron/commit/bdafc02e35ab8f5bf9f4cf86d38ee734347529d7)), closes [#1835](https://github.com/theholocron/holocron/issues/1835)
* **specs:** 📝 a thread per pull request in the [#prs](https://github.com/theholocron/holocron/issues/prs) spec ([#1830](https://github.com/theholocron/holocron/issues/1830)) ([c8053e7](https://github.com/theholocron/holocron/commit/c8053e7ff968475026efbf3c71630a8331da8507)), closes [#1738](https://github.com/theholocron/holocron/issues/1738)

## [5.0.0-alpha.357](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.356...v5.0.0-alpha.357) (2026-11-07)

### Refactoring

* **config:** ♻️ one home for the Sentry org slug ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1848](https://github.com/theholocron/holocron/issues/1848)) ([9c4a3d9](https://github.com/theholocron/holocron/commit/9c4a3d9be51c1d9db11c92e8ccff8264062f60b1))

## [5.0.0-alpha.356](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.355...v5.0.0-alpha.356) (2026-11-07)

### Bug Fixes

* **cli:** 🔧 read the Axiom dataset as AXIOM_DATASET through the credential chain ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1839](https://github.com/theholocron/holocron/issues/1839)) ([facf22c](https://github.com/theholocron/holocron/commit/facf22c406beff60a473ea3fa726ca4bfe273c70)), closes [#1838](https://github.com/theholocron/holocron/issues/1838)
* **config:** 🔧 sync the Pages project and PostHog token variables ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1847](https://github.com/theholocron/holocron/issues/1847)) ([6bafa8c](https://github.com/theholocron/holocron/commit/6bafa8c880a6e438cae3fa890ee1f80d2cfcf9fe))

### Refactoring

* **cli:** 🔐 read monitoring and vite-config env through the credential chain ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1850](https://github.com/theholocron/holocron/issues/1850)) ([7827537](https://github.com/theholocron/holocron/commit/78275378426988c94235a1d323133409081f1e68)), closes [#1849](https://github.com/theholocron/holocron/issues/1849)

### Documentation

* **dagobah:** 📝 describe the manifest flow and process supervisor in the metadata ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1845](https://github.com/theholocron/holocron/issues/1845)) ([d6b1334](https://github.com/theholocron/holocron/commit/d6b13345b9c59fd11392883f63dfc73c5317ba98))

## [5.0.0-alpha.355](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.354...v5.0.0-alpha.355) (2026-11-07)

### Features

* **config:** 🗂️ share the root org area with app configs ([#1829](https://github.com/theholocron/holocron/issues/1829)) ([#1836](https://github.com/theholocron/holocron/issues/1836)) ([9b581be](https://github.com/theholocron/holocron/commit/9b581be3e4c5df90b0e533521b2b1045e8b0d5c0))

## [5.0.0-alpha.354](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.353...v5.0.0-alpha.354) (2026-11-06)

### Features

* **config:** ☁️ read the Cloudflare account id through the credential chain ([#1827](https://github.com/theholocron/holocron/issues/1827)) ([#1828](https://github.com/theholocron/holocron/issues/1828)) ([61c1133](https://github.com/theholocron/holocron/commit/61c11332bc2e188aea85445afc9577715fd4b75c))
* **notifications:** ✨ default and starter reactions for forum channels ([#1825](https://github.com/theholocron/holocron/issues/1825)) ([e0571e3](https://github.com/theholocron/holocron/commit/e0571e30502c1dddf58d105771bca68496a67bd7)), closes [#1822](https://github.com/theholocron/holocron/issues/1822)

## [5.0.0-alpha.353](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.352...v5.0.0-alpha.353) (2026-11-06)

### Features

* **cli:** ✨ add an org area to .holocron that fills provider options ([#1820](https://github.com/theholocron/holocron/issues/1820)) ([#1823](https://github.com/theholocron/holocron/issues/1823)) ([621ebbb](https://github.com/theholocron/holocron/commit/621ebbb065a916461e29505bef9cd065eb303c50))

### Refactoring

* **plugins:** ♻️ read the environment through env-utils ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1821](https://github.com/theholocron/holocron/issues/1821)) ([5be91d5](https://github.com/theholocron/holocron/commit/5be91d57cc3d861de0d5ad31f72ef19d42fbf054))

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1819](https://github.com/theholocron/holocron/issues/1819)) ([b579ffc](https://github.com/theholocron/holocron/commit/b579ffc44dc20cfd8a9698b7b4c9438ad16ebcb8))

## [5.0.0-alpha.352](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.351...v5.0.0-alpha.352) (2026-11-06)

### Features

* **cli:** ✨ sync GitHub variables from a 1Password Environment ([#1817](https://github.com/theholocron/holocron/issues/1817)) ([#1818](https://github.com/theholocron/holocron/issues/1818)) ([5176943](https://github.com/theholocron/holocron/commit/5176943456c81a7d8d2f36cbf51ec9305353497b))

## [5.0.0-alpha.351](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.350...v5.0.0-alpha.351) (2026-11-06)

### Refactoring

* **cli:** ♻️ keep the *.md module type beside its only importer ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1815](https://github.com/theholocron/holocron/issues/1815)) ([f75dcd4](https://github.com/theholocron/holocron/commit/f75dcd4e9a6edaf8ae38f90a51154492e3812b73))
* **cli:** ♻️ turn the token-docs test into a docs tokens probe ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1816](https://github.com/theholocron/holocron/issues/1816)) ([dab2d9d](https://github.com/theholocron/holocron/commit/dab2d9d9c1a7c3676d22ec149dc0ae0110344c83))

## [5.0.0-alpha.350](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.349...v5.0.0-alpha.350) (2026-11-06)

### Refactoring

* **cli:** ♻️ move dco.yml to astromech and org.md to .holocron ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1813](https://github.com/theholocron/holocron/issues/1813)) ([668cb31](https://github.com/theholocron/holocron/commit/668cb3160cdd66d9c8fac7ee4754e263a34823ae))

## [5.0.0-alpha.349](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.348...v5.0.0-alpha.349) (2026-11-06)

### Features

* **datapad:** 📂 load area files from a .holocron/ directory ([#1796](https://github.com/theholocron/holocron/issues/1796)) ([09380e1](https://github.com/theholocron/holocron/commit/09380e13b64c39ebf8159365e2457d1a1c68d9cf)), closes [#1783](https://github.com/theholocron/holocron/issues/1783) [#1783](https://github.com/theholocron/holocron/issues/1783)
* **sentinel:** 🛰️ fetch the .holocron/ tree when validating a config ([#1798](https://github.com/theholocron/holocron/issues/1798)) ([0af73e9](https://github.com/theholocron/holocron/commit/0af73e961f2640935818fb7ef7a58d47a26b2378)), closes [#1785](https://github.com/theholocron/holocron/issues/1785) [#1785](https://github.com/theholocron/holocron/issues/1785) [#1785](https://github.com/theholocron/holocron/issues/1785) [#1785](https://github.com/theholocron/holocron/issues/1785)

### Refactoring

* **config:** 🗂️ move RULES.md and the webhook avatar into .holocron/ ([#1801](https://github.com/theholocron/holocron/issues/1801)) ([1b3321e](https://github.com/theholocron/holocron/commit/1b3321e1e14abaa32b696830c0424d9256ba5d76)), closes [#1788](https://github.com/theholocron/holocron/issues/1788) [#1788](https://github.com/theholocron/holocron/issues/1788) [#1788](https://github.com/theholocron/holocron/issues/1788) [#1788](https://github.com/theholocron/holocron/issues/1788)
* **config:** 🗂️ move the Discord server layout into .holocron/notifications.ts ([#1799](https://github.com/theholocron/holocron/issues/1799)) ([48b0f59](https://github.com/theholocron/holocron/commit/48b0f59b8d0febcd74e397e4aa726d950a32a8b2)), closes [#1786](https://github.com/theholocron/holocron/issues/1786) [#1786](https://github.com/theholocron/holocron/issues/1786) [#1786](https://github.com/theholocron/holocron/issues/1786)
* **config:** 🗂️ move the repo block into .holocron/repo.ts ([#1800](https://github.com/theholocron/holocron/issues/1800)) ([fd12f65](https://github.com/theholocron/holocron/commit/fd12f6540b265ea4d765f56caa2098ed35bbcbc5)), closes [#1787](https://github.com/theholocron/holocron/issues/1787) [#1787](https://github.com/theholocron/holocron/issues/1787) [#1787](https://github.com/theholocron/holocron/issues/1787)

### Documentation

* **config:** 🗂️ move the .holocron/ spec to specifications as accepted and document the shipped shape ([#1802](https://github.com/theholocron/holocron/issues/1802)) ([c1d218c](https://github.com/theholocron/holocron/commit/c1d218c5915bd2223310061c6f9615e49ebc7526)), closes [#1789](https://github.com/theholocron/holocron/issues/1789) [#1789](https://github.com/theholocron/holocron/issues/1789) [#1789](https://github.com/theholocron/holocron/issues/1789)

### Chores

* **setup:** 🔧 install the gh-stack extension in setup.sh ([#1812](https://github.com/theholocron/holocron/issues/1812)) ([d4ffd78](https://github.com/theholocron/holocron/commit/d4ffd78cff76ccd0f094d690025adc73dfae449a))

## [5.0.0-alpha.348](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.347...v5.0.0-alpha.348) (2026-11-06)

### Refactoring

* **cli:** ♻️ inline the http-client re-export, drop plugin/rest-client ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1809](https://github.com/theholocron/holocron/issues/1809)) ([f826494](https://github.com/theholocron/holocron/commit/f8264940de0d5dec84d45064dafb34d96b2292ac))

## [5.0.0-alpha.347](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.346...v5.0.0-alpha.347) (2026-11-06)

### Bug Fixes

* **cli:** 🔑 restore a PEM whose line breaks became spaces in secrets sync ([#1808](https://github.com/theholocron/holocron/issues/1808)) ([2d71d59](https://github.com/theholocron/holocron/commit/2d71d599b306d1897eaa9ab06751e6251a0b9220)), closes [#1744](https://github.com/theholocron/holocron/issues/1744)

### Refactoring

* **kyber:** ♻️ move HTTP checks, connection probe and major-tag mover to kyber ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1805](https://github.com/theholocron/holocron/issues/1805)) ([5b15112](https://github.com/theholocron/holocron/commit/5b15112ac543d435adaa35fc79b15b94fae391b4))

## [5.0.0-alpha.346](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.345...v5.0.0-alpha.346) (2026-11-06)

### Features

* **kyber:** ✨ add a plugin system under /plugins ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1803](https://github.com/theholocron/holocron/issues/1803)) ([9f00d23](https://github.com/theholocron/holocron/commit/9f00d238dc1a045fea4386ba7ced2d34c9e5f3c8))

### Refactoring

* **astromech:** ♻️ move generic Node upgrade to astromech/upgrade ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1794](https://github.com/theholocron/holocron/issues/1794)) ([05cd347](https://github.com/theholocron/holocron/commit/05cd347c5f9b38a83436d2fdec9c5db14c934d9c))

## [5.0.0-alpha.345](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.344...v5.0.0-alpha.345) (2026-11-06)

### Refactoring

* **dagobah:** ♻️ move the GitHub App manifest flow into dagobah ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1792](https://github.com/theholocron/holocron/issues/1792)) ([5fbb3be](https://github.com/theholocron/holocron/commit/5fbb3be407c635988eaa72700a683b058c2e4cf0))

## [5.0.0-alpha.344](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.343...v5.0.0-alpha.344) (2026-11-06)

### Bug Fixes

* **ci:** 🐛 👷 🏷️ name the real thin-caller generator in generated workflow headers ([#1795](https://github.com/theholocron/holocron/issues/1795)) ([cf6993f](https://github.com/theholocron/holocron/commit/cf6993f10d687802413f8a10357d60858f0ab1fb)), closes [#1106](https://github.com/theholocron/holocron/issues/1106)

### Refactoring

* **kyber:** ♻️ extract the command registry into kyber /menu ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1793](https://github.com/theholocron/holocron/issues/1793)) ([a61916b](https://github.com/theholocron/holocron/commit/a61916bb6199c4d14c090f796b263b6361629f1e))

### Documentation

* **specs:** 📚️ 🗂️ record the three .holocron decisions and move the spec to proposed ([#1790](https://github.com/theholocron/holocron/issues/1790)) ([5cb47d2](https://github.com/theholocron/holocron/commit/5cb47d237eabd29051fd31004189125ab8e19591)), closes [#1747](https://github.com/theholocron/holocron/issues/1747)

## [5.0.0-alpha.343](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.342...v5.0.0-alpha.343) (2026-11-06)

### Refactoring

* **dagobah:** ♻️ move the process supervisor out of the CLI ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1777](https://github.com/theholocron/holocron/issues/1777)) ([5cee21e](https://github.com/theholocron/holocron/commit/5cee21e4fd98448a8083458f0d4195ef770cee8c))
* **http-client:** ♻️ remove deprecated token resolver, now in kyber/secrets ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1780](https://github.com/theholocron/holocron/issues/1780)) ([19896c3](https://github.com/theholocron/holocron/commit/19896c3e0642c6acc6202804e4d12aefd3e3094e))
* **kyber:** ♻️ move finishCredentialsFile to /secrets ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1778](https://github.com/theholocron/holocron/issues/1778)) ([6205519](https://github.com/theholocron/holocron/commit/62055190052c48542e2d38e85bdd09f631c23149))
* **kyber:** ♻️ move the check-rows renderer into kyber/ui ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1779](https://github.com/theholocron/holocron/issues/1779)) ([e825d24](https://github.com/theholocron/holocron/commit/e825d246c2d00633251511b898f2d025cde3bb4f))

### Documentation

* 📝 drop stale refs to folders moved into kyber ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1776](https://github.com/theholocron/holocron/issues/1776)) ([0b83022](https://github.com/theholocron/holocron/commit/0b83022f441513d65c9dfd422bfa8a0a38fc8499))
* **specs:** spec for the .holocron directory ([#1775](https://github.com/theholocron/holocron/issues/1775)) ([7a6157f](https://github.com/theholocron/holocron/commit/7a6157fde3179625a694faf440f714ac92647e18)), closes [#1747](https://github.com/theholocron/holocron/issues/1747)

### Chores

* 📋 declare the v5 board and generate its hourly reconcile workflow ([#1770](https://github.com/theholocron/holocron/issues/1770)) ([04942c3](https://github.com/theholocron/holocron/commit/04942c388c890a4d2b621d7a32157b5dae66de4a)), closes [#1744](https://github.com/theholocron/holocron/issues/1744)
* **specs:** 🔧 🔄 sync spec discussions ([#1782](https://github.com/theholocron/holocron/issues/1782)) ([8d3257d](https://github.com/theholocron/holocron/commit/8d3257d45e0ddb731094db0486cdf64ac112b99a))

## [5.0.0-alpha.342](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.341...v5.0.0-alpha.342) (2026-11-06)

### Features

* **kyber:** ✨ add observability subpath for logger and telemetry wiring ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1773](https://github.com/theholocron/holocron/issues/1773)) ([2d17ad5](https://github.com/theholocron/holocron/commit/2d17ad5e98052fe0a2a5baa2b88b12e2cc7b2e29))

### Refactoring

* **kyber:** ♻️ move the retry notice into /ui as createRetryNotice ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1771](https://github.com/theholocron/holocron/issues/1771)) ([10d129d](https://github.com/theholocron/holocron/commit/10d129d6fa386597bbc57d40416da1e2ee999b62))

## [5.0.0-alpha.341](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.340...v5.0.0-alpha.341) (2026-11-06)

### Features

* **cli:** 🌿 add a config-system factory to kyber and build holocron's config on it ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1765](https://github.com/theholocron/holocron/issues/1765)) ([5f97312](https://github.com/theholocron/holocron/commit/5f97312919a32b5d322cd2cff324ee25570261e8))
* **cli:** 🌿 add error text cleaning and a default progress listener to kyber's /ui ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1751](https://github.com/theholocron/holocron/issues/1751)) ([95e4f4a](https://github.com/theholocron/holocron/commit/95e4f4a85347b20f2a27b42da622b710fe695820))
* **cli:** 🌿 add the token resolver to kyber's /secrets and deprecate http-client's copy ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1762](https://github.com/theholocron/holocron/issues/1762)) ([711d9cd](https://github.com/theholocron/holocron/commit/711d9cd3979f9d28b01f48de0b5c08e6d2caec7e))
* **cli:** 🌿 move the interactive menu engine into kyber's /menu ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1767](https://github.com/theholocron/holocron/issues/1767)) ([b77f39b](https://github.com/theholocron/holocron/commit/b77f39bb59006e49111f7c4e29199cf84643a1f6))

### Bug Fixes

* **cli:** 🐛 name the release caller in publish --initial's Trusted Publisher steps ([#1760](https://github.com/theholocron/holocron/issues/1760)) ([3640e4c](https://github.com/theholocron/holocron/commit/3640e4ce84bd14725ac20c9bab09ea161a672f11))

### Refactoring

* **cli:** ♻️ 🧹 call kyber's update check from cli.ts and drop the one-call wrapper ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1749](https://github.com/theholocron/holocron/issues/1749)) ([e6d6b52](https://github.com/theholocron/holocron/commit/e6d6b52e35583ddeabd07fc3371224bce9c62ef9))
* **cli:** 🧹 build the token resolvers on kyber's instead of http-client's ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1763](https://github.com/theholocron/holocron/issues/1763)) ([22591ff](https://github.com/theholocron/holocron/commit/22591ff9ca7a155b823812dd2ab85599a82c6d2b))
* **cli:** 🧹 delete cli/src/testing in favour of kyber's /testing ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1766](https://github.com/theholocron/holocron/issues/1766)) ([bfb9e65](https://github.com/theholocron/holocron/commit/bfb9e655a1eeaf708317df1346df87f5d2eaefaf))
* **cli:** 🧹 delete the CLI's ui directory ([#1754](https://github.com/theholocron/holocron/issues/1754)) ([352117c](https://github.com/theholocron/holocron/commit/352117c03fc99405367ddcfa4ad11a8bcd6273c1)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🧹 import the token helpers and test require from kyber, not the CLI ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1758](https://github.com/theholocron/holocron/issues/1758)) ([0af9af3](https://github.com/theholocron/holocron/commit/0af9af3f64603634b100f188734dbfee98925892))
* **cli:** 🧹 remove the env, cli-support and auth folders ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1768](https://github.com/theholocron/holocron/issues/1768)) ([8e4615f](https://github.com/theholocron/holocron/commit/8e4615ffee6e012dab651dfdf258dc9b3261efe9))

## [5.0.0-alpha.340](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.339...v5.0.0-alpha.340) (2026-11-05)

### Features

* **cli:** add doctor project and project move ([#1759](https://github.com/theholocron/holocron/issues/1759)) ([9ea9423](https://github.com/theholocron/holocron/commit/9ea9423079e430e629924c5666aeaa639ad69950)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#1744](https://github.com/theholocron/holocron/issues/1744)
* **cli:** add project reconcile and its hourly workflow ([#1757](https://github.com/theholocron/holocron/issues/1757)) ([19c3f90](https://github.com/theholocron/holocron/commit/19c3f90ba611db15887b5e10a707a0e175bac78c)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#1744](https://github.com/theholocron/holocron/issues/1744)
* **cli:** project list, create, close and setup commands ([#1761](https://github.com/theholocron/holocron/issues/1761)) ([1761828](https://github.com/theholocron/holocron/commit/176182851a6d7e7e88332bf928d24e002e7111b7))
* **github:** add the projects capability for Projects v2 boards ([#1755](https://github.com/theholocron/holocron/issues/1755)) ([6f05088](https://github.com/theholocron/holocron/commit/6f050883778798347f911657c4a75ac62a1c3a67)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#1744](https://github.com/theholocron/holocron/issues/1744)

## [5.0.0-alpha.339](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.338...v5.0.0-alpha.339) (2026-11-05)

### Features

* **cli:** 📋 add a projects capability and the board template schema ([#1750](https://github.com/theholocron/holocron/issues/1750)) ([f2d06c2](https://github.com/theholocron/holocron/commit/f2d06c23a63817ec0ff2b5e179baff4c9a97809d)), closes [#1744](https://github.com/theholocron/holocron/issues/1744)

### Documentation

* **specs:** 🧩 project management as a neutral capability; templates are files ([#1746](https://github.com/theholocron/holocron/issues/1746)) ([646c877](https://github.com/theholocron/holocron/commit/646c877f116aae1c2ba6eda4eb0f73ddc3c8b549)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#alerts](https://github.com/theholocron/holocron/issues/alerts)

## [5.0.0-alpha.338](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.337...v5.0.0-alpha.338) (2026-11-05)

### Features

* **cli:** 📦 publish dagobah and kyber as ordinary dependencies of the CLI ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1748](https://github.com/theholocron/holocron/issues/1748)) ([8d5b285](https://github.com/theholocron/holocron/commit/8d5b2856d8b21fb51da96f7c7923ee27be92f14f))

## [5.0.0-alpha.337](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.336...v5.0.0-alpha.337) (2026-11-05)

### Features

* **cli:** 🌿 add @theholocron/kyber and move the terminal output helpers into its /ui ([#1731](https://github.com/theholocron/holocron/issues/1731)) ([3fad716](https://github.com/theholocron/holocron/commit/3fad716ad77efc7f24a9760d9ba305d0faf3c450)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🌿 move the CLI test harness into kyber's /testing ([#1740](https://github.com/theholocron/holocron/issues/1740)) ([eab64bc](https://github.com/theholocron/holocron/commit/eab64bc578d271e04e20cd4b59b4f8f83fe7ffec)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🌿 move the global flags helpers into kyber's /flags ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1741](https://github.com/theholocron/holocron/issues/1741)) ([efadaea](https://github.com/theholocron/holocron/commit/efadaea88cf5c25a2dedbb2c127c1dab1c30b5e1))
* **cli:** 🌿 move the keyring, credential store and --token parsing into /secrets ([#1735](https://github.com/theholocron/holocron/issues/1735)) ([415c98b](https://github.com/theholocron/holocron/commit/415c98ba71a4f0226af33c525de087ed4814e91e)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🌿 move the menu and the option prompts into kyber's /prompts ([#1736](https://github.com/theholocron/holocron/issues/1736)) ([5651908](https://github.com/theholocron/holocron/commit/5651908abafe58491081612ba8dff5a2fa3222e3)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🌿 move the token file helpers into kyber's /secrets ([#1733](https://github.com/theholocron/holocron/issues/1733)) ([290021a](https://github.com/theholocron/holocron/commit/290021a004fa4b6620bbdf284e1bf0e9fc47c639)), closes [#1727](https://github.com/theholocron/holocron/issues/1727) [#1727](https://github.com/theholocron/holocron/issues/1727)
* **cli:** 🌿 move the update notifier into kyber's /notifier ([#1732](https://github.com/theholocron/holocron/issues/1732)) ([794e626](https://github.com/theholocron/holocron/commit/794e626bf08f818f4190253071cefc5622fb834c)), closes [#1727](https://github.com/theholocron/holocron/issues/1727)

### Documentation

* **cli:** 📝 document @theholocron/kyber on the docs site ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1742](https://github.com/theholocron/holocron/issues/1742)) ([dd7f50f](https://github.com/theholocron/holocron/commit/dd7f50f2fa019436222696666c3e573f7f9de851))
* **specs:** 📚️ 📋️ declare the project board as code, with value-safe field changes ([#1745](https://github.com/theholocron/holocron/issues/1745)) ([281b897](https://github.com/theholocron/holocron/commit/281b8971c5fae0a6509bfac22ab828682d3c53e1)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#493](https://github.com/theholocron/holocron/issues/493)

### Chores

* **specs:** 🔄 sync spec discussions ([#1743](https://github.com/theholocron/holocron/issues/1743)) ([9ff068e](https://github.com/theholocron/holocron/commit/9ff068eacb4f77dc3024e690ecf95d2ca9001bf3))

## [5.0.0-alpha.336](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.335...v5.0.0-alpha.336) (2026-11-05)

### Features

* **comlink:** ✨ 📡 relay the holocron Sentry project to [#errors](https://github.com/theholocron/holocron/issues/errors) ([#1737](https://github.com/theholocron/holocron/issues/1737)) ([a5ee3d7](https://github.com/theholocron/holocron/commit/a5ee3d79f22249ef01289a3578f1931a9dd81722)), closes [#1580](https://github.com/theholocron/holocron/issues/1580)

### Documentation

* **specs:** 📚️ 📝 spec a [#prs](https://github.com/theholocron/holocron/issues/prs) channel that shows which pull requests need handling ([#1739](https://github.com/theholocron/holocron/issues/1739)) ([2c6c1a1](https://github.com/theholocron/holocron/commit/2c6c1a10e4859633ae25b4bf83d0adc5b4ea523f)), closes [#1738](https://github.com/theholocron/holocron/issues/1738)

## [5.0.0-alpha.335](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.334...v5.0.0-alpha.335) (2026-11-05)

### Chores

* **deps:** bump the all-dependencies group across 1 directory with 24 updates ([#1707](https://github.com/theholocron/holocron/issues/1707)) ([cea9385](https://github.com/theholocron/holocron/commit/cea938521228ef1ad0bf72e2e4650e47e0e5f606))

## [5.0.0-alpha.334](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.333...v5.0.0-alpha.334) (2026-11-05)

### Chores

* **deps:** bump the all-actions group with 21 updates ([#1706](https://github.com/theholocron/holocron/issues/1706)) ([3340e3f](https://github.com/theholocron/holocron/commit/3340e3f71279b750ccd7fe49dc0d335c7a067c41))

## [5.0.0-alpha.333](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.332...v5.0.0-alpha.333) (2026-11-05)

### Bug Fixes

* **repo:** 🐛 report a stale install in setup.sh doctor, and fix run-check on Node 25 ([#1730](https://github.com/theholocron/holocron/issues/1730)) ([24ce7cb](https://github.com/theholocron/holocron/commit/24ce7cbb9eed49b00731e3f74931c87240f985e9)), closes [#1717](https://github.com/theholocron/holocron/issues/1717)

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1729](https://github.com/theholocron/holocron/issues/1729)) ([9c7d27e](https://github.com/theholocron/holocron/commit/9c7d27efec2e421adc5a0c91e9dd84b7918ecfb7))

## [5.0.0-alpha.332](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.331...v5.0.0-alpha.332) (2026-11-05)

### Bug Fixes

* **astromech:** 🐛 name each failed job in the `holocron run ci` summary ([#1725](https://github.com/theholocron/holocron/issues/1725)) ([94b44ee](https://github.com/theholocron/holocron/commit/94b44ee665c7ddd040848d96521fc8a3e14dae6f)), closes [#1717](https://github.com/theholocron/holocron/issues/1717)
* **dagobah:** 🐛 read an unquoted multi-line PEM value in loadDevEnv ([#1724](https://github.com/theholocron/holocron/issues/1724)) ([1a45319](https://github.com/theholocron/holocron/commit/1a453193734402e27d5ece6159a8094c83ea91a1)), closes [#1716](https://github.com/theholocron/holocron/issues/1716) [#1713](https://github.com/theholocron/holocron/issues/1713)

### Documentation

* **cli:** 📝 spec @theholocron/kyber, the reusable parts of the CLI ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1728](https://github.com/theholocron/holocron/issues/1728)) ([1a2cd30](https://github.com/theholocron/holocron/commit/1a2cd30fdf100f0237586aa486f14a3e01c2df67))

## [5.0.0-alpha.331](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.330...v5.0.0-alpha.331) (2026-11-05)

### Bug Fixes

* **cli:** 🐛 ship tsx as a dependency, since holocron dev serve imports it at run time ([#1718](https://github.com/theholocron/holocron/issues/1718)) ([#1723](https://github.com/theholocron/holocron/issues/1723)) ([3c44843](https://github.com/theholocron/holocron/commit/3c44843a00921231d2ed6fca3d63ff00e682df41))

### Documentation

* **cli:** 📝 describe dagobah and dev.serve in the agent instructions ([#1722](https://github.com/theholocron/holocron/issues/1722)) ([f3ab4c5](https://github.com/theholocron/holocron/commit/f3ab4c542d46b92f27007eb95da1dfd5294f16b7)), closes [#1714](https://github.com/theholocron/holocron/issues/1714)

## [5.0.0-alpha.330](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.329...v5.0.0-alpha.330) (2026-11-05)

### Features

* **cli:** 🌿 add @theholocron/dagobah, the local dev server Sentinel's serve script uses ([#1715](https://github.com/theholocron/holocron/issues/1715)) ([41a8e21](https://github.com/theholocron/holocron/commit/41a8e2193ef825b2200c60c24ba0ad44805d72d4)), closes [#1714](https://github.com/theholocron/holocron/issues/1714) [#1714](https://github.com/theholocron/holocron/issues/1714) [#1714](https://github.com/theholocron/holocron/issues/1714) [#1714](https://github.com/theholocron/holocron/issues/1714)
* **cli:** 🌿 holocron dev serves a handler itself, from dev.serve ([#1719](https://github.com/theholocron/holocron/issues/1719)) ([9f6f536](https://github.com/theholocron/holocron/commit/9f6f536b435c0d7dd1f16b02cf9b2ed8438715eb)), closes [#1718](https://github.com/theholocron/holocron/issues/1718) [#1718](https://github.com/theholocron/holocron/issues/1718) [#1718](https://github.com/theholocron/holocron/issues/1718) [#1718](https://github.com/theholocron/holocron/issues/1718) [#1718](https://github.com/theholocron/holocron/issues/1718) [#1718](https://github.com/theholocron/holocron/issues/1718)

## [5.0.0-alpha.329](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.328...v5.0.0-alpha.329) (2026-11-05)

### Bug Fixes

* **1password:** 🐛 read an unquoted multi-line PEM value from the dotenv output ([#1713](https://github.com/theholocron/holocron/issues/1713)) ([#1716](https://github.com/theholocron/holocron/issues/1716)) ([9af2b44](https://github.com/theholocron/holocron/commit/9af2b4427d583039f2cbb3071cc330935b0daae5))

## [5.0.0-alpha.328](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.327...v5.0.0-alpha.328) (2026-11-04)

### Refactoring

* **cli:** 🚚 move Sentinel's deploy staging scripts into `holocron deploy stage` ([#1701](https://github.com/theholocron/holocron/issues/1701)) ([f8d2ea2](https://github.com/theholocron/holocron/commit/f8d2ea28cac52342f729650854c2ea6a79eb8870)), closes [#1700](https://github.com/theholocron/holocron/issues/1700) [#1700](https://github.com/theholocron/holocron/issues/1700) [#1700](https://github.com/theholocron/holocron/issues/1700) [#1700](https://github.com/theholocron/holocron/issues/1700)

### Documentation

* **sentinel:** 📚️ 📝 say the dev instance logs to the same dataset, filtered by env ([#1712](https://github.com/theholocron/holocron/issues/1712)) ([4e34dd4](https://github.com/theholocron/holocron/commit/4e34dd4c21d54e38e8e7b3781009a373a08b2685)), closes [#1694](https://github.com/theholocron/holocron/issues/1694)

## [5.0.0-alpha.327](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.326...v5.0.0-alpha.327) (2026-11-04)

### Features

* **cli:** 🔑 secrets sync follows repo.secrets.sync and skips blank values ([#1702](https://github.com/theholocron/holocron/issues/1702)) ([#1703](https://github.com/theholocron/holocron/issues/1703)) ([904932b](https://github.com/theholocron/holocron/commit/904932bce16ebfe2a598176faf381e2bdc3eff98))
* **repo:** 🧰 add .humans with a Brewfile and one setup script for a fresh clone ([#1704](https://github.com/theholocron/holocron/issues/1704)) ([#1705](https://github.com/theholocron/holocron/issues/1705)) ([43d0158](https://github.com/theholocron/holocron/commit/43d0158982a0ce11ed5baa5b7052447a060187a4))

### Chores

* **deps:** bump @astrojs/react from 6.0.6 to 7.1.2 ([#1709](https://github.com/theholocron/holocron/issues/1709)) ([51f74cf](https://github.com/theholocron/holocron/commit/51f74cff280619ca2be01a52793dc1c3bbc6b7c0))
* **deps:** bump eslint-package-json from 0.3.0 to 3.0.0 ([#1708](https://github.com/theholocron/holocron/issues/1708)) ([a285f93](https://github.com/theholocron/holocron/commit/a285f93cdbdbd14b0ceda2cb0fb686d1f2042d9f))

## [5.0.0-alpha.326](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.325...v5.0.0-alpha.326) (2026-11-04)

### Features

* **cli:** ⚙️ read holocron dev's settings from a dev block in holocron.config ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1690](https://github.com/theholocron/holocron/issues/1690)) ([344b778](https://github.com/theholocron/holocron/commit/344b778283f886195bd6244f1da6761654b5ad9a))
* **cli:** 🧪 add holocron dev to run an app behind its tunnel with its vault secrets ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1687](https://github.com/theholocron/holocron/issues/1687)) ([f2de0d7](https://github.com/theholocron/holocron/commit/f2de0d7621528be45bf19845535f01863021f8db))
* **cli:** 🚇 add tunnel up for a stable public hostname to a local port ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1680](https://github.com/theholocron/holocron/issues/1680)) ([910006b](https://github.com/theholocron/holocron/commit/910006bfba98dad48161fa84f0f7366e3eb013a3))
* **cloudflare:** 🚇 add a tunnels capability for a stable dev webhook address ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1679](https://github.com/theholocron/holocron/issues/1679)) ([f555bfd](https://github.com/theholocron/holocron/commit/f555bfd2de4f1e250b5f8ceebc0dc2dfd063876a))
* **env-utils:** 🌍 one definition of the environment names and of CI detection ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1696](https://github.com/theholocron/holocron/issues/1696)) ([ffb77bf](https://github.com/theholocron/holocron/commit/ffb77bffafcc44cb4a049ee25f71c3dc3dc550e9))
* **observability:** 🏷️ tag log lines local, dev, ci, stage or prod in one dataset ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1694](https://github.com/theholocron/holocron/issues/1694)) ([a8b2aee](https://github.com/theholocron/holocron/commit/a8b2aee9e72e76502e614306809c4b0f7dfb6a74))
* **sentinel:** 🧪 add pnpm dev to run the handler locally behind a tunnel ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1686](https://github.com/theholocron/holocron/issues/1686)) ([7c24bd0](https://github.com/theholocron/holocron/commit/7c24bd0e5887d5822cf2d62938c349fcebe55372)), closes [#1100](https://github.com/theholocron/holocron/issues/1100)

### Documentation

* **publish:** 📝 the npm trusted publisher is the calling workflow, ci.release.yml ([#1699](https://github.com/theholocron/holocron/issues/1699)) ([d10c466](https://github.com/theholocron/holocron/commit/d10c4669ed43ed9bdcaf842d4f6408c30df54c40))

### Chores

* **sentinel:** 🚇 add the tunnels provider to Sentinel's config ([#1678](https://github.com/theholocron/holocron/issues/1678)) ([#1685](https://github.com/theholocron/holocron/issues/1685)) ([8d7ebfb](https://github.com/theholocron/holocron/commit/8d7ebfba3836521d70e9db50e61b33550f4d2721))

## [5.0.0-alpha.325](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.324...v5.0.0-alpha.325) (2026-11-04)

### Bug Fixes

* **sentinel:** 🐛 read the autoFix opt-out from the format task, and its alias ([#1698](https://github.com/theholocron/holocron/issues/1698)) ([1bed1cc](https://github.com/theholocron/holocron/commit/1bed1ccc864bcd8deb183220cde89eed05621ee4)), closes [#1697](https://github.com/theholocron/holocron/issues/1697)

## [5.0.0-alpha.324](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.323...v5.0.0-alpha.324) (2026-11-04)

### Features

* **cli:** 📋 add auth export --blank and --vendor-names to build a whole environment's file ([#1695](https://github.com/theholocron/holocron/issues/1695)) ([c953854](https://github.com/theholocron/holocron/commit/c953854cccf76e0da865a2b654d43c4c0d695df9)), closes [#1606](https://github.com/theholocron/holocron/issues/1606)

### Documentation

* **astromech:** 📝 fix prose left wrong by the flat task vocabulary ([#1691](https://github.com/theholocron/holocron/issues/1691)) ([3c19211](https://github.com/theholocron/holocron/commit/3c19211f7033f8e71b9bb18ede5913109994b9c6))

## [5.0.0-alpha.323](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.322...v5.0.0-alpha.323) (2026-11-04)

### Features

* **cli:** 🔎 probe tasks names reads LEGACY_NAMES, finds bare and reserved names, fails by default ([#1688](https://github.com/theholocron/holocron/issues/1688)) ([e87f2b1](https://github.com/theholocron/holocron/commit/e87f2b15c733d4da69d4a0918c86c9e4222492f5)), closes [#1612](https://github.com/theholocron/holocron/issues/1612)
* **cli:** 🩺 doctor ci checks a repo against the flat task vocabulary ([#1692](https://github.com/theholocron/holocron/issues/1692)) ([ba632b9](https://github.com/theholocron/holocron/commit/ba632b954381eacc027fa7f72dcf1084a85fa779)), closes [#1689](https://github.com/theholocron/holocron/issues/1689)

## [5.0.0-alpha.322](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.321...v5.0.0-alpha.322) (2026-11-04)

### Features

* **cli:** 🪄 create a GitHub App from a manifest with github-app create ([#1674](https://github.com/theholocron/holocron/issues/1674)) ([#1677](https://github.com/theholocron/holocron/issues/1677)) ([35771ee](https://github.com/theholocron/holocron/commit/35771ee3d406ed5f151393b43e63aa46397441c6))

### Bug Fixes

* **cli:** 📋 copy just the value for a single auth export --only token ([#1681](https://github.com/theholocron/holocron/issues/1681)) ([#1684](https://github.com/theholocron/holocron/issues/1684)) ([031e71e](https://github.com/theholocron/holocron/commit/031e71e3c9cb347d315112b3e0e597a8b2feb808))

## [5.0.0-alpha.321](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.320...v5.0.0-alpha.321) (2026-11-04)

### Features

* **cli:** 📋 add auth export --only to get one token out of the keyring ([#1681](https://github.com/theholocron/holocron/issues/1681)) ([#1682](https://github.com/theholocron/holocron/issues/1682)) ([efe669f](https://github.com/theholocron/holocron/commit/efe669fd51c097bad8d434d173bebf6c81dddcc2))

### Refactoring

* **astromech:** ✂️ split repoValidation into validate:specs and validate:docs ([#1676](https://github.com/theholocron/holocron/issues/1676)) ([e820ba9](https://github.com/theholocron/holocron/commit/e820ba95dc67ecf1f427ac64297a60c76fb9bdd7)), closes [#1622](https://github.com/theholocron/holocron/issues/1622)

## [5.0.0-alpha.320](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.319...v5.0.0-alpha.320) (2026-11-03)

### Features

* **sentinel:** 🔐 keep Sentinel's and Comlink's secrets in 1Password ([#1671](https://github.com/theholocron/holocron/issues/1671)) ([#1673](https://github.com/theholocron/holocron/issues/1673)) ([229e398](https://github.com/theholocron/holocron/commit/229e398e2fc334dd81a98d44421a1e8c9c5e30d2))

### Refactoring

* **ci:** ✂️ split formatting into lint:editorconfig, lint:markdown and a format action ([#1675](https://github.com/theholocron/holocron/issues/1675)) ([9aaee79](https://github.com/theholocron/holocron/commit/9aaee792c72115fe4047ef78e1dcf672a0914932)), closes [#1621](https://github.com/theholocron/holocron/issues/1621)

## [5.0.0-alpha.319](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.318...v5.0.0-alpha.319) (2026-11-03)

### Refactoring

* **ci:** 🏷️ workflow, job and file names are the task id; replace the grouping guard ([#1668](https://github.com/theholocron/holocron/issues/1668)) ([bedd951](https://github.com/theholocron/holocron/commit/bedd95108518ae50ad204d84bc4436f7cc887cca)), closes [#1620](https://github.com/theholocron/holocron/issues/1620)

## [5.0.0-alpha.318](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.317...v5.0.0-alpha.318) (2026-11-03)

### Features

* **comlink:** 📡 name the Sentry project from the webhook and document relaying more ([#1665](https://github.com/theholocron/holocron/issues/1665)) ([#1667](https://github.com/theholocron/holocron/issues/1667)) ([8035a44](https://github.com/theholocron/holocron/commit/8035a44168d5333fd328fd5acf1522c91b8df4a1)), closes [#1580](https://github.com/theholocron/holocron/issues/1580)

## [5.0.0-alpha.317](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.316...v5.0.0-alpha.317) (2026-11-03)

### Refactoring

* **env-utils:** 🧹 import the side-effect-free /lookup subpath ([#1640](https://github.com/theholocron/holocron/issues/1640)) ([#1670](https://github.com/theholocron/holocron/issues/1670)) ([c356c71](https://github.com/theholocron/holocron/commit/c356c71b02bb10aacf56976fb4113a8b69ef06b5))

## [5.0.0-alpha.316](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.315...v5.0.0-alpha.316) (2026-11-03)

### Features

* **specs:** 🔗 link a plain id in the normal sync once its file is on the default branch ([#1663](https://github.com/theholocron/holocron/issues/1663)) ([#1664](https://github.com/theholocron/holocron/issues/1664)) ([899cce4](https://github.com/theholocron/holocron/commit/899cce442ad72b3da9dde5b2ed2188867fafa985))

## [5.0.0-alpha.315](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.314...v5.0.0-alpha.315) (2026-11-03)

### Features

* **configs:** 🧩 presets speak the flat ids ([#1662](https://github.com/theholocron/holocron/issues/1662)) ([f951745](https://github.com/theholocron/holocron/commit/f951745c281d73c7db5d20acc47ab812595854c1)), closes [#1625](https://github.com/theholocron/holocron/issues/1625)
* **specs:** 🏷️ drop the New spec / New ADR prefix from forum post titles ([#1657](https://github.com/theholocron/holocron/issues/1657)) ([#1659](https://github.com/theholocron/holocron/issues/1659)) ([989f1e4](https://github.com/theholocron/holocron/commit/989f1e4e120b138358e24306386be73a800f8aec))
* **specs:** 🔗 link the SPEC / ADR id on a forum post to its file ([#1658](https://github.com/theholocron/holocron/issues/1658)) ([#1660](https://github.com/theholocron/holocron/issues/1660)) ([0b2e76c](https://github.com/theholocron/holocron/commit/0b2e76c6eaa171af8c28ab7347c103568ab262ca))

### Refactoring

* **astromech:** ♻️ generate turbo.json and package scripts from the flat ids ([#1641](https://github.com/theholocron/holocron/issues/1641)) ([683f9ed](https://github.com/theholocron/holocron/commit/683f9ede1506288ad9d1a2a581814b9a36bbb3c3)), closes [#1616](https://github.com/theholocron/holocron/issues/1616) [#1616](https://github.com/theholocron/holocron/issues/1616) [#1616](https://github.com/theholocron/holocron/issues/1616) [#1616](https://github.com/theholocron/holocron/issues/1616)
* **ci:** 🗂️ group ci/ sources by suite and generate flat reusables ([#1661](https://github.com/theholocron/holocron/issues/1661)) ([b79d9d9](https://github.com/theholocron/holocron/commit/b79d9d9bc3d30c7104c1da03c036f7518d3e7c55)), closes [#1619](https://github.com/theholocron/holocron/issues/1619)
* **repo:** ♻️ rename scripts and tasks across this monorepo to the flat ids ([#1646](https://github.com/theholocron/holocron/issues/1646)) ([62f97fe](https://github.com/theholocron/holocron/commit/62f97feec78ebf614e18ffff53eebaa030cfd220)), closes [#1617](https://github.com/theholocron/holocron/issues/1617) [#1617](https://github.com/theholocron/holocron/issues/1617)

## [5.0.0-alpha.314](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.313...v5.0.0-alpha.314) (2026-11-03)

### Features

* **checkly:** 🩺 alert-channel settings and per-check routing ([#1599](https://github.com/theholocron/holocron/issues/1599)) ([#1647](https://github.com/theholocron/holocron/issues/1647)) ([8c25fc9](https://github.com/theholocron/holocron/commit/8c25fc96353af0244a51973454b8a1cf87604b83))

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1651](https://github.com/theholocron/holocron/issues/1651)) ([2616f04](https://github.com/theholocron/holocron/commit/2616f045ed7f7369383c899bddca2551bfbe55a9))

## [5.0.0-alpha.313](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.312...v5.0.0-alpha.313) (2026-11-03)

### Features

* **notifications:** 🖼️ take { url, image } pictures for channel webhooks ([#1596](https://github.com/theholocron/holocron/issues/1596)) ([#1648](https://github.com/theholocron/holocron/issues/1648)) ([41c2af1](https://github.com/theholocron/holocron/commit/41c2af1a53b2bcf67b6404026ea8024e794b5711))
* **specs:** 🔕 withdraw a forum post when its pull request closes unmerged ([#1653](https://github.com/theholocron/holocron/issues/1653)) ([#1655](https://github.com/theholocron/holocron/issues/1655)) ([3eea355](https://github.com/theholocron/holocron/commit/3eea355c800692092b567df387cf4d5421b4903b))
* **specs:** 🔧 add specs sync --refresh-origin to repair the PR line on posts ([#1652](https://github.com/theholocron/holocron/issues/1652)) ([#1654](https://github.com/theholocron/holocron/issues/1654)) ([0d22bbe](https://github.com/theholocron/holocron/commit/0d22bbed2e61d243a95ac72a5948ceff0f344e3e)), closes [#1601](https://github.com/theholocron/holocron/issues/1601)

## [5.0.0-alpha.312](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.311...v5.0.0-alpha.312) (2026-11-03)

### Features

* **notifications:** 🔄 Sentinel-hosted role sync ([#1595](https://github.com/theholocron/holocron/issues/1595)) ([#1649](https://github.com/theholocron/holocron/issues/1649)) ([336962e](https://github.com/theholocron/holocron/commit/336962e758e4343dd8c5b507a797325441a13ee0))
* **specs:** 📬 post to the forum while the pull request is still open ([#1600](https://github.com/theholocron/holocron/issues/1600)) ([#1645](https://github.com/theholocron/holocron/issues/1645)) ([b0c3ec3](https://github.com/theholocron/holocron/commit/b0c3ec3243f97efa21be44766ac5399f0794da68))

### Bug Fixes

* **notifications:** 🛡️ harden the avatar loader: follow redirects safely, cap the download ([#1597](https://github.com/theholocron/holocron/issues/1597)) ([#1644](https://github.com/theholocron/holocron/issues/1644)) ([966edd9](https://github.com/theholocron/holocron/commit/966edd967c91374d268a49740de5366bbb4d7b49))
* **specs:** 🔖 name no pull request on a forum post for specs added in bulk ([#1601](https://github.com/theholocron/holocron/issues/1601)) ([#1642](https://github.com/theholocron/holocron/issues/1642)) ([1609d7d](https://github.com/theholocron/holocron/commit/1609d7d82e8c5450b62f169dbbfbbda903bbc138))

## [5.0.0-alpha.311](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.310...v5.0.0-alpha.311) (2026-11-03)

### Features

* **cli:** 🩺 print one doctor credentials row per variable ([#1643](https://github.com/theholocron/holocron/issues/1643)) ([c6b676a](https://github.com/theholocron/holocron/commit/c6b676ab2ea566a10dafd792695618074c222c5d)), closes [#1606](https://github.com/theholocron/holocron/issues/1606)

## [5.0.0-alpha.310](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.309...v5.0.0-alpha.310) (2026-11-03)

### Features

* **auth:** 🪶 a token a plugin only falls back to is optional for doctor credentials ([#1639](https://github.com/theholocron/holocron/issues/1639)) ([88fa5d1](https://github.com/theholocron/holocron/commit/88fa5d1a730e52825a919ec53d31fb90f2484be1))

## [5.0.0-alpha.309](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.308...v5.0.0-alpha.309) (2026-11-03)

### Bug Fixes

* **auth:** 🔎 auth export finds org-scoped tokens and lists each token on its own row ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1638](https://github.com/theholocron/holocron/issues/1638)) ([80aff2d](https://github.com/theholocron/holocron/commit/80aff2d82f83f1b8e158bc1fe7bd5ffb9070771a))

### Refactoring

* **astromech:** 🏷️ flat verb-first task ids and suites in the registry, runner and config ([#1637](https://github.com/theholocron/holocron/issues/1637)) ([d56288d](https://github.com/theholocron/holocron/commit/d56288d8d5b5d4d52089048527d15f9782757c15)), closes [#1612](https://github.com/theholocron/holocron/issues/1612) [#1615](https://github.com/theholocron/holocron/issues/1615)

## [5.0.0-alpha.308](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.307...v5.0.0-alpha.308) (2026-11-03)

### Features

* **auth:** 🔒 auth export writes a private, short-lived .credentials file ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1634](https://github.com/theholocron/holocron/issues/1634)) ([9b665fb](https://github.com/theholocron/holocron/commit/9b665fb4f0b802ea0f871e442b5dea5f8e3cbff1))

### Bug Fixes

* **setup:** 🧭 say how to fix a custom property value the org does not allow ([#1636](https://github.com/theholocron/holocron/issues/1636)) ([fa7c862](https://github.com/theholocron/holocron/commit/fa7c862c6e4298479a316ea05e60d1da7c363f87))

## [5.0.0-alpha.307](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.306...v5.0.0-alpha.307) (2026-11-03)

### Features

* **cli:** ✅ holocron probe tasks names and a stale-context ruleset comparison ([#1635](https://github.com/theholocron/holocron/issues/1635)) ([aadf3db](https://github.com/theholocron/holocron/commit/aadf3db9527bd1ec1d74621d45616db3adc0ffa5)), closes [#1618](https://github.com/theholocron/holocron/issues/1618)

## [5.0.0-alpha.306](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.305...v5.0.0-alpha.306) (2026-11-03)

### Features

* **ci:** ✅ one stable required check: the ci aggregate with a failing-job summary ([#1630](https://github.com/theholocron/holocron/issues/1630)) ([d35fbd1](https://github.com/theholocron/holocron/commit/d35fbd130defa08e1d09c4d6bc9a52a0fb68eba1)), closes [#1613](https://github.com/theholocron/holocron/issues/1613)

## [5.0.0-alpha.305](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.304...v5.0.0-alpha.305) (2026-11-03)

### Features

* **auth:** 📋 auth export puts the stored tokens on the clipboard as NAME=value ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1633](https://github.com/theholocron/holocron/issues/1633)) ([c40c84c](https://github.com/theholocron/holocron/commit/c40c84c5fcb7e43daff9ae05dc037af372d2d80b))

## [5.0.0-alpha.304](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.303...v5.0.0-alpha.304) (2026-11-03)

### Features

* **config:** 🔐 read this repo's tokens from the Holocron 1Password Environment ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1632](https://github.com/theholocron/holocron/issues/1632)) ([befdece](https://github.com/theholocron/holocron/commit/befdece6d55dac671ad880058e5695a1c6b9f8be))

## [5.0.0-alpha.303](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.302...v5.0.0-alpha.303) (2026-11-03)

### Features

* **doctor:** 🩺 doctor credentials checks the environment holds the tokens the plugins take ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1631](https://github.com/theholocron/holocron/issues/1631)) ([884880b](https://github.com/theholocron/holocron/commit/884880b160edd69cc38f845a0da69322c4d3b05c))

## [5.0.0-alpha.302](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.301...v5.0.0-alpha.302) (2026-11-02)

### Features

* **auth:** 💬 auth set says which variable to add to the credentials environment ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1629](https://github.com/theholocron/holocron/issues/1629)) ([b7fa115](https://github.com/theholocron/holocron/commit/b7fa1152e56590d6c4944ebcc64a63266ec99058))

### Bug Fixes

* **notifications:** 🔔 name the failing jobs in the failed-run post ([#1628](https://github.com/theholocron/holocron/issues/1628)) ([c8d2020](https://github.com/theholocron/holocron/commit/c8d2020a381df7eb436107f906618496add1ba6d)), closes [#1614](https://github.com/theholocron/holocron/issues/1614)

### Chores

* **specs:** 🔧 🔄 sync spec discussions ([#1626](https://github.com/theholocron/holocron/issues/1626)) ([28728d6](https://github.com/theholocron/holocron/commit/28728d699eb7da4f3c5634c7b1be236873f4bc92))

## [5.0.0-alpha.301](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.300...v5.0.0-alpha.301) (2026-11-02)

### Features

* **auth:** 🗝️ read the repo's .env as its own step in the token chain ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1627](https://github.com/theholocron/holocron/issues/1627)) ([edb0bbb](https://github.com/theholocron/holocron/commit/edb0bbb377bb107034fc814778ee3258c75a2fa8))

## [5.0.0-alpha.300](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.299...v5.0.0-alpha.300) (2026-11-02)

### Features

* **auth:** 🔐 a credentials capability that reads tokens from a 1Password Environment ([#1606](https://github.com/theholocron/holocron/issues/1606)) ([#1611](https://github.com/theholocron/holocron/issues/1611)) ([7fa2757](https://github.com/theholocron/holocron/commit/7fa27572373cd5e84efca149de6f77b0c65176fa))

### Documentation

* **ci:** 📐 spec: a flat verb vocabulary for tasks, workflows and scripts ([#1610](https://github.com/theholocron/holocron/issues/1610)) ([05c6fa5](https://github.com/theholocron/holocron/commit/05c6fa570b4e915a1f50dc746d5afeefbe9ef8fa)), closes [#1262](https://github.com/theholocron/holocron/issues/1262) [#1262](https://github.com/theholocron/holocron/issues/1262)

## [5.0.0-alpha.299](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.298...v5.0.0-alpha.299) (2026-11-02)

### Bug Fixes

* **plugin-1password:** 🩹 make vault optional and read Environments by name ([#1607](https://github.com/theholocron/holocron/issues/1607)) ([#1609](https://github.com/theholocron/holocron/issues/1609)) ([f7f6113](https://github.com/theholocron/holocron/commit/f7f61135b73a0955d8ec943bebabc0656e56ccb3))

## [5.0.0-alpha.298](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.297...v5.0.0-alpha.298) (2026-11-02)

### Features

* **auth:** 🧠 read each stored token from the keyring once per process ([#1605](https://github.com/theholocron/holocron/issues/1605)) ([#1608](https://github.com/theholocron/holocron/issues/1608)) ([0bc46bd](https://github.com/theholocron/holocron/commit/0bc46bde736d630657f07c5e4a226a8436b7ee84))

## [5.0.0-alpha.297](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.296...v5.0.0-alpha.297) (2026-11-02)

### Features

* **cli:** 🔑 sync-wiki reads its token from the keyring too ([#1598](https://github.com/theholocron/holocron/issues/1598)) ([#1603](https://github.com/theholocron/holocron/issues/1603)) ([638ca2b](https://github.com/theholocron/holocron/commit/638ca2b6746429ce0244923888a31073256e9fa6))
* **notifications:** 🚀 post successful deploys and Preview Check results to [#deploys](https://github.com/theholocron/holocron/issues/deploys) ([#1578](https://github.com/theholocron/holocron/issues/1578)) ([#1604](https://github.com/theholocron/holocron/issues/1604)) ([11fdd0e](https://github.com/theholocron/holocron/commit/11fdd0eb286eac0aa2142c05e1ac02f71d29e23f))

## [5.0.0-alpha.296](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.295...v5.0.0-alpha.296) (2026-11-02)

### Features

* **cli:** 📚 move the org agent instructions into holocron and sync them into each repo ([#1593](https://github.com/theholocron/holocron/issues/1593)) ([812c64d](https://github.com/theholocron/holocron/commit/812c64d1755a1cd1496918dd256044d10ad353e3)), closes [#1217](https://github.com/theholocron/holocron/issues/1217)
* **notifications:** 🩺 doctor checks the Notifications workflow and the secrets it reads ([#1581](https://github.com/theholocron/holocron/issues/1581)) ([#1602](https://github.com/theholocron/holocron/issues/1602)) ([f9ebd6c](https://github.com/theholocron/holocron/commit/f9ebd6cdd409cb6d61d853e46fbc5c469e929688))

## [5.0.0-alpha.295](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.294...v5.0.0-alpha.295) (2026-11-02)

### Refactoring

* **release:** ♻️ move groupReleaseConfig into semantic-release-config ([#1558](https://github.com/theholocron/holocron/issues/1558)) ([f11b63c](https://github.com/theholocron/holocron/commit/f11b63c5558115426c4afb0c9e3d3574a1e071d6)), closes [#1246](https://github.com/theholocron/holocron/issues/1246) [#1592](https://github.com/theholocron/holocron/issues/1592) [#1576](https://github.com/theholocron/holocron/issues/1576)

### Chores

* **notifications:** 🔧 give welcome and rules a webhook so notifyCheck can post to them ([#1594](https://github.com/theholocron/holocron/issues/1594)) ([03d381f](https://github.com/theholocron/holocron/commit/03d381f0e540b8cd60350e31fbb832566c043fea)), closes [#1574](https://github.com/theholocron/holocron/issues/1574)

## [5.0.0-alpha.294](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.293...v5.0.0-alpha.294) (2026-11-02)

### Features

* **cli:** 🩺 doctor dns checks Sentinel's record, the docs domain and the mail records ([#1583](https://github.com/theholocron/holocron/issues/1583)) ([d878d47](https://github.com/theholocron/holocron/commit/d878d473ac882f71e87abacae22af4a570293b1d)), closes [#1568](https://github.com/theholocron/holocron/issues/1568)

### Documentation

* 🌐 inventory of the theholocron.dev names, records and who serves them ([#1584](https://github.com/theholocron/holocron/issues/1584)) ([d33e6de](https://github.com/theholocron/holocron/commit/d33e6de3b4a84f7d315284c4a8ce46a77a4bc039))
* **notifications:** 📚 document notify, the HOLOCRON_NOTIFY_* secrets, notifyCheck and the Notifications workflow ([#1592](https://github.com/theholocron/holocron/issues/1592)) ([fa1930d](https://github.com/theholocron/holocron/commit/fa1930db59ce6868466cf53b6599c7e40c7b21c3)), closes [#1576](https://github.com/theholocron/holocron/issues/1576)
* **notifications:** 📝 list what reaches Discord on its own ([#1159](https://github.com/theholocron/holocron/issues/1159)) ([#1588](https://github.com/theholocron/holocron/issues/1588)) ([70b6067](https://github.com/theholocron/holocron/commit/70b60679cb0d893fcce9501a9defef5dc75f8e1e))
* **specs:** 🧵 finish the move off GitHub Discussions ([#1589](https://github.com/theholocron/holocron/issues/1589)) ([ae23cf0](https://github.com/theholocron/holocron/commit/ae23cf0fe492a8051a985c39fb2f93bd591af3c0)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)

### Chores

* **notifications:** 🧪 add rules and welcome to platform.notifyCheck ([#1590](https://github.com/theholocron/holocron/issues/1590)) ([80af39a](https://github.com/theholocron/holocron/commit/80af39a061deaa6089cf7f1b12342cb1a9ddfcbb)), closes [#1574](https://github.com/theholocron/holocron/issues/1574)
* **notifications:** 🧹 make the spec-post title wording agree with the code ([#1591](https://github.com/theholocron/holocron/issues/1591)) ([bdbaa36](https://github.com/theholocron/holocron/commit/bdbaa36ea9bebd35b195ee77c1c7fc38f902ac49)), closes [#1160](https://github.com/theholocron/holocron/issues/1160) [#ideas](https://github.com/theholocron/holocron/issues/ideas) [#1575](https://github.com/theholocron/holocron/issues/1575)

## [5.0.0-alpha.293](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.292...v5.0.0-alpha.293) (2026-11-02)

### Features

* **notifications:** 💅 format the doctor post in markdown and link its channels ([#1585](https://github.com/theholocron/holocron/issues/1585)) ([#1587](https://github.com/theholocron/holocron/issues/1587)) ([a7dea06](https://github.com/theholocron/holocron/commit/a7dea060e9b26a597bad523f64c9e36bc1145dbd))

## [5.0.0-alpha.292](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.291...v5.0.0-alpha.292) (2026-11-02)

### Features

* **notifications:** 📣 post the doctor result to Discord with --post ([#1585](https://github.com/theholocron/holocron/issues/1585)) ([#1586](https://github.com/theholocron/holocron/issues/1586)) ([fc11f9a](https://github.com/theholocron/holocron/commit/fc11f9a0e435cae2290e3bf2743b198bbea9ad3e))

## [5.0.0-alpha.291](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.290...v5.0.0-alpha.291) (2026-11-02)

### Features

* **docs:** 📚 measure every package export, not only the root ([#1531](https://github.com/theholocron/holocron/issues/1531)) ([#1555](https://github.com/theholocron/holocron/issues/1555)) ([ac983a2](https://github.com/theholocron/holocron/commit/ac983a26faaacba3bb8980dd8c98c8677c5ab649))
* **notifications:** 🔔 post failed runs and releases to Discord ([#1159](https://github.com/theholocron/holocron/issues/1159)) ([#1557](https://github.com/theholocron/holocron/issues/1557)) ([3fe0189](https://github.com/theholocron/holocron/commit/3fe0189911ca6c5b65fd96ca3fd17be44d079647)), closes [#alerts](https://github.com/theholocron/holocron/issues/alerts) [#deploys](https://github.com/theholocron/holocron/issues/deploys) [#releases](https://github.com/theholocron/holocron/issues/releases)

### Bug Fixes

* **specs:** 🔗 find a discussion post by its recorded address when its file moves ([#1554](https://github.com/theholocron/holocron/issues/1554)) ([16bc32c](https://github.com/theholocron/holocron/commit/16bc32ce9e6ede82b62e00a53b457a9864d078ac)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)

### Documentation

* 📝 clear the alex inclusive-language hits across the markdown ([#1559](https://github.com/theholocron/holocron/issues/1559)) ([573580e](https://github.com/theholocron/holocron/commit/573580ee02d288ce5184d69ee8cc09acbdb95042)), closes [#1263](https://github.com/theholocron/holocron/issues/1263) [#868](https://github.com/theholocron/holocron/issues/868) [#1311](https://github.com/theholocron/holocron/issues/1311) [#1354](https://github.com/theholocron/holocron/issues/1354)
* **specs:** 📝 mark tech-specs-to-ideas superseded by the forum design ([#1553](https://github.com/theholocron/holocron/issues/1553)) ([d160248](https://github.com/theholocron/holocron/commit/d1602488a9f9b12a3ecb718ab86c5e43bdc59431))

### Chores

* **specs:** ⏪ put tech-specs-to-ideas back to proposed ([#1552](https://github.com/theholocron/holocron/issues/1552)) ([288b755](https://github.com/theholocron/holocron/commit/288b755a47d3e9f46272996fbb6ab4cb2001fa21)), closes [#1551](https://github.com/theholocron/holocron/issues/1551) [#1535](https://github.com/theholocron/holocron/issues/1535)
* **specs:** 📦 move the superseded specs-to-ideas spec out of .notes ([#1535](https://github.com/theholocron/holocron/issues/1535)) ([#1556](https://github.com/theholocron/holocron/issues/1556)) ([9b40457](https://github.com/theholocron/holocron/commit/9b4045792a1227ef130abde314c6d10f39ab3a94))
* **specs:** 🔧 🔄 sync spec discussions ([#1551](https://github.com/theholocron/holocron/issues/1551)) ([e73394a](https://github.com/theholocron/holocron/commit/e73394ad39ff40977112cbffff2224f40572dc09))

## [5.0.0-alpha.290](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.289...v5.0.0-alpha.290) (2026-11-02)

### Features

* **specs:** 🔒 close and lock the discussion of a finished document ([#1550](https://github.com/theholocron/holocron/issues/1550)) ([ab31a7c](https://github.com/theholocron/holocron/commit/ab31a7cca665e02d0f1a9c0aa5da81be8499941b)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)

## [5.0.0-alpha.289](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.288...v5.0.0-alpha.289) (2026-11-02)

### Bug Fixes

* **cli:** 🚦 stop specs sync at the first rate limit ([#1549](https://github.com/theholocron/holocron/issues/1549)) ([39e2034](https://github.com/theholocron/holocron/commit/39e20346f1e529805586a5046e628bfd95f0e11a)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)

### Chores

* **specs:** 🔄 link every spec and ADR to its discussion post ([#1548](https://github.com/theholocron/holocron/issues/1548)) ([6a200e8](https://github.com/theholocron/holocron/commit/6a200e8d4e9882ec263a067bd4b1040c6a499aa7))

## [5.0.0-alpha.288](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.287...v5.0.0-alpha.288) (2026-11-02)

### Features

* **cli:** 🔄 add holocron specs sync to keep a forum post per ADR and spec ([#1542](https://github.com/theholocron/holocron/issues/1542)) ([7b4c131](https://github.com/theholocron/holocron/commit/7b4c131f8e1070ee4fe959b7ec6809212bcf91a3)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)
* **discord-client:** 🧵 add forum posts and threads to the bot client ([#1539](https://github.com/theholocron/holocron/issues/1539)) ([cbd4e0b](https://github.com/theholocron/holocron/commit/cbd4e0bb6c14a44fcc5c0a0ae6f7ed4dba594754)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)
* **notifications:** 🗂️ declare a forum channel with status tags in the layout ([#1540](https://github.com/theholocron/holocron/issues/1540)) ([e452cb2](https://github.com/theholocron/holocron/commit/e452cb2c1ea07f57e51c2de95569aa4f9f4213ca)), closes [#ideas](https://github.com/theholocron/holocron/issues/ideas) [#1535](https://github.com/theholocron/holocron/issues/1535)
* **notifications:** 🧵 find, make and change a document's discussion post ([#1541](https://github.com/theholocron/holocron/issues/1541)) ([71314af](https://github.com/theholocron/holocron/commit/71314af4a0ab8dd5e99e6a3f0538683f25c0774c)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)
* **specs:** 🔢 number the specs and open each discussion post with its id and pull request ([#1544](https://github.com/theholocron/holocron/issues/1544)) ([b3660a8](https://github.com/theholocron/holocron/commit/b3660a85bf1fa32a0ee75057912ffa7c8c514036)), closes [#1538](https://github.com/theholocron/holocron/issues/1538) [#1535](https://github.com/theholocron/holocron/issues/1535)

### Bug Fixes

* **notifications:** 🗂️ fix forum setup: welcome, onboarding, and the Manage Threads grant ([#1546](https://github.com/theholocron/holocron/issues/1546)) ([4846277](https://github.com/theholocron/holocron/commit/4846277f28f9418ab892fa236619a217ba2af8fe)), closes [#ideas](https://github.com/theholocron/holocron/issues/ideas) [#1535](https://github.com/theholocron/holocron/issues/1535)

### Documentation

* **specs:** 📝 propose a forum post for each ADR and spec, kept in step by a batch job ([#1538](https://github.com/theholocron/holocron/issues/1538)) ([6f535cc](https://github.com/theholocron/holocron/commit/6f535cc2c37ab3414ee78ae18bb05622c87aad12))

## [5.0.0-alpha.287](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.286...v5.0.0-alpha.287) (2026-11-01)

### Features

* **notifications:** 💡 post new and changed specs to [#ideas](https://github.com/theholocron/holocron/issues/ideas) ([#1537](https://github.com/theholocron/holocron/issues/1537)) ([6b6db10](https://github.com/theholocron/holocron/commit/6b6db10b36fe7565c5d31ee8cb619d3178185911))
* **notifications:** 📜 pin a channel message from a repo file, starting with RULES.md ([#1536](https://github.com/theholocron/holocron/issues/1536)) ([9f19d58](https://github.com/theholocron/holocron/commit/9f19d5883e02041455503535d4e26db6ee4c23a4))

## [5.0.0-alpha.286](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.285...v5.0.0-alpha.286) (2026-11-01)

### Features

* **platform:** ✨ release ci as a tag-only version group ([#1525](https://github.com/theholocron/holocron/issues/1525)) ([dc25fa6](https://github.com/theholocron/holocron/commit/dc25fa6e3c34deb847465625907cd99098e3d1c3)), closes [#1481](https://github.com/theholocron/holocron/issues/1481) [#1215](https://github.com/theholocron/holocron/issues/1215)

## [5.0.0-alpha.285](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.284...v5.0.0-alpha.285) (2026-11-01)

### Refactoring

* **astromech:** ♻️ move the ADR and spec check into the CLI as probe specs check ([#1527](https://github.com/theholocron/holocron/issues/1527)) ([fa30450](https://github.com/theholocron/holocron/commit/fa304500df8894bf1c76e87c986e4bc8e4ddddc4)), closes [#929](https://github.com/theholocron/holocron/issues/929) [#1522](https://github.com/theholocron/holocron/issues/1522)
* **sentinel:** ♻️ run the docs-presence check on the shared rules ([#1526](https://github.com/theholocron/holocron/issues/1526)) ([c2d8cec](https://github.com/theholocron/holocron/commit/c2d8cece9c79b8519749ddc5e9b98770d15929e5)), closes [#929](https://github.com/theholocron/holocron/issues/929)

## [5.0.0-alpha.284](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.283...v5.0.0-alpha.284) (2026-11-01)

### Refactoring

* **astromech:** ♻️ move the docs-presence rules into astromech/repo-validation ([#1524](https://github.com/theholocron/holocron/issues/1524)) ([59647d4](https://github.com/theholocron/holocron/commit/59647d430a52ffbf0bf22f474571e7c82882c102)), closes [#929](https://github.com/theholocron/holocron/issues/929)

## [5.0.0-alpha.283](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.282...v5.0.0-alpha.283) (2026-11-01)

### Refactoring

* **platform:** 📁 move the reusable workflows and actions into the ci package ([#1523](https://github.com/theholocron/holocron/issues/1523)) ([e77c435](https://github.com/theholocron/holocron/commit/e77c43587ebecb7963df195a8f00558dc75e503b)), closes [#1480](https://github.com/theholocron/holocron/issues/1480) [#1215](https://github.com/theholocron/holocron/issues/1215)

## [5.0.0-alpha.282](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.281...v5.0.0-alpha.282) (2026-11-01)

### Refactoring

* **cli:** ♻️ warn on a feat without docs, as holocron probe docs presence ([#1518](https://github.com/theholocron/holocron/issues/1518)) ([97c2420](https://github.com/theholocron/holocron/commit/97c2420487960c0a261720b9eb3fb4bfd2f0baa3)), closes [#1515](https://github.com/theholocron/holocron/issues/1515)

### Documentation

* 📝 trim the config, datapad and docs-theme pages the generated reference duplicates ([#1517](https://github.com/theholocron/holocron/issues/1517)) ([34007c4](https://github.com/theholocron/holocron/commit/34007c414446b400155800dd3c234bd5b280fdc6)), closes [#1512](https://github.com/theholocron/holocron/issues/1512)
* **clients:** 📝 trim the client pages the generated reference duplicates ([#1520](https://github.com/theholocron/holocron/issues/1520)) ([5645029](https://github.com/theholocron/holocron/commit/56450296a9ae723f71a2e447e0a987b9b417af48)), closes [#1512](https://github.com/theholocron/holocron/issues/1512)
* **notes:** 📝 mark the API docs spec accepted and move it to the wiki ([#1516](https://github.com/theholocron/holocron/issues/1516)) ([00816b8](https://github.com/theholocron/holocron/commit/00816b8e41053876fec09de48c8283c2b477e549)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **plugins:** 📝 trim the plugin pages the generated reference duplicates ([#1519](https://github.com/theholocron/holocron/issues/1519)) ([2ddca97](https://github.com/theholocron/holocron/commit/2ddca97460005e2bce01a2e52ac4cf637f7d7882)), closes [#1512](https://github.com/theholocron/holocron/issues/1512)
* **utils:** 📝 trim the utils pages the generated reference duplicates ([#1521](https://github.com/theholocron/holocron/issues/1521)) ([5ff11f9](https://github.com/theholocron/holocron/commit/5ff11f9f5e8af1486d1bd096ef12d8b70af22dc7)), closes [#1512](https://github.com/theholocron/holocron/issues/1512)

## [5.0.0-alpha.281](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.280...v5.0.0-alpha.281) (2026-11-01)

### Features

* **astro-config:** ✨ add skipErrorChecking to apiReference ([#1510](https://github.com/theholocron/holocron/issues/1510)) ([9257051](https://github.com/theholocron/holocron/commit/9257051b2092ac7a90254793459dd68293e88aaf)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)

### Refactoring

* **astromech:** ♻️ one place that says where the hosted workflows live ([#1508](https://github.com/theholocron/holocron/issues/1508)) ([f39a587](https://github.com/theholocron/holocron/commit/f39a587a13a2ab4a6a51abc3dd2586d483413e14))

### Documentation

* 📝 generate the API reference for configs, plugins and the CLI packages ([#1509](https://github.com/theholocron/holocron/issues/1509)) ([e8717af](https://github.com/theholocron/holocron/commit/e8717af264cddc242bac29cb7d44359786b50c4a))
* **clients:** 📝 generate the API reference for every client package ([#1507](https://github.com/theholocron/holocron/issues/1507)) ([acf6db9](https://github.com/theholocron/holocron/commit/acf6db9394d28e3c7ef55f3221e062aaf1b18441))
* **utils:** 📝 generate the API reference for every utils package ([#1506](https://github.com/theholocron/holocron/issues/1506)) ([fcc26de](https://github.com/theholocron/holocron/commit/fcc26de73ea8d0b23482ad356cb4e5394131befd))

## [5.0.0-alpha.280](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.279...v5.0.0-alpha.280) (2026-11-01)

### Bug Fixes

* **cli:** 🐛 leave symbols from another package's dist out of docs coverage ([#1505](https://github.com/theholocron/holocron/issues/1505)) ([b53a661](https://github.com/theholocron/holocron/commit/b53a661a07dcf178ccb0b5f2edf80d22a5d60c65))

### Documentation

* **astromech:** 📝 say what a TaskDef holds in its doc comment ([#1504](https://github.com/theholocron/holocron/issues/1504)) ([dc7a679](https://github.com/theholocron/holocron/commit/dc7a679ecdbba1256448869f1afb5a9cd8ee27b4))
* **cli:** 📝 document the config, probe and datapad API with TSDoc ([#1500](https://github.com/theholocron/holocron/issues/1500)) ([28bc6f2](https://github.com/theholocron/holocron/commit/28bc6f23a5de5b02e13dafb615eee1b44f1273d6))

## [5.0.0-alpha.279](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.278...v5.0.0-alpha.279) (2026-11-01)

### Features

* **cli:** 🔍 probe ci refs: inventory .github and scan the org for references to it ([#1485](https://github.com/theholocron/holocron/issues/1485)) ([1270f20](https://github.com/theholocron/holocron/commit/1270f201edc42a35c5e569b326b046a3211f1125)), closes [#1473](https://github.com/theholocron/holocron/issues/1473) [#1215](https://github.com/theholocron/holocron/issues/1215)

### Documentation

* **cli:** 📝 document capabilities a-l with TSDoc ([#1498](https://github.com/theholocron/holocron/issues/1498)) ([5ef69a9](https://github.com/theholocron/holocron/commit/5ef69a95560a3b279f3cc0deaab6235b41cb7896))
* **plugin-github:** 📝 document the public API with TSDoc ([#1489](https://github.com/theholocron/holocron/issues/1489)) ([9136f6c](https://github.com/theholocron/holocron/commit/9136f6c522ddbef8bfc4ac1559ef3e4579a68c54))
* **plugins:** 📝 document the checkly, discord, cloudflare and postman plugins with TSDoc ([#1493](https://github.com/theholocron/holocron/issues/1493)) ([f35af04](https://github.com/theholocron/holocron/commit/f35af04ca3bac3190f0b2aa79e8eea9ac235928e))
* **plugins:** 📝 document the posthog, axiom, vercel and sentry plugins with TSDoc ([#1499](https://github.com/theholocron/holocron/issues/1499)) ([0895d02](https://github.com/theholocron/holocron/commit/0895d02db5b0c26e26d8024a6192580bd8cd9203))
* **plugins:** 📝 document the remaining plugins with TSDoc ([#1497](https://github.com/theholocron/holocron/issues/1497)) ([add1b57](https://github.com/theholocron/holocron/commit/add1b5723a308371dfd9d46987118e7828bbcbc2))

## [5.0.0-alpha.278](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.277...v5.0.0-alpha.278) (2026-10-31)

### Features

* **cli:** ✨ add repoValidation.docsCoverage to switch the docs gate ([#1483](https://github.com/theholocron/holocron/issues/1483)) ([038ee35](https://github.com/theholocron/holocron/commit/038ee35d64d7904061545ed50ad539e82442d5de)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **cli:** ✨ upload doc-comment coverage to Codecov with probe --lcov ([#1482](https://github.com/theholocron/holocron/issues/1482)) ([0c99e8f](https://github.com/theholocron/holocron/commit/0c99e8fa606ec62036d72d339d2ac72b4761fe28)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)

### Documentation

* **array-utils:** 📝 generate the API reference from TSDoc ([#1374](https://github.com/theholocron/holocron/issues/1374)) ([13e2205](https://github.com/theholocron/holocron/commit/13e2205f3e4b2fdaeed21cc4d4fd4ef2462a1d49)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **astromech:** 📝 document the codecov generator's package types ([#1488](https://github.com/theholocron/holocron/issues/1488)) ([549dae8](https://github.com/theholocron/holocron/commit/549dae88c8a63f4b9ac67cc9d067fe11834381e8)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **astromech:** 📝 document the public API with TSDoc ([#1487](https://github.com/theholocron/holocron/issues/1487)) ([5101949](https://github.com/theholocron/holocron/commit/5101949448a675105e1a194a5bb7b2948b366e73)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **cli:** 📝 document the presets and drop the holocron-config requirement ([#1471](https://github.com/theholocron/holocron/issues/1471)) ([260e98b](https://github.com/theholocron/holocron/commit/260e98b1f91475347276e1fdf1d5541eaedbe557)), closes [#1271](https://github.com/theholocron/holocron/issues/1271)
* **notes:** 📝 spec for API docs as a measured CI gate ([#1472](https://github.com/theholocron/holocron/issues/1472)) ([50859ff](https://github.com/theholocron/holocron/commit/50859ff093a0ab6dd406b00eec6b54cc1bf11b63)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **platform:** 📝 spec for hosting workflows in holocron ([#1479](https://github.com/theholocron/holocron/issues/1479)) ([c121b12](https://github.com/theholocron/holocron/commit/c121b123724cf366f766f74eafc701cd848371c0)), closes [#1215](https://github.com/theholocron/holocron/issues/1215)

## [5.0.0-alpha.277](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.276...v5.0.0-alpha.277) (2026-10-31)

### Features

* **cli:** 🩺 doctor notifications checks the Comlink relay Worker ([#1461](https://github.com/theholocron/holocron/issues/1461)) ([fd6e814](https://github.com/theholocron/holocron/commit/fd6e8146cf659cb25bfda39bf0ea0ecb0aba75ec)), closes [#1458](https://github.com/theholocron/holocron/issues/1458) [#1162](https://github.com/theholocron/holocron/issues/1162)
* **cli:** 🩺 doctor notifications checks the error tracker's relay side ([#1462](https://github.com/theholocron/holocron/issues/1462)) ([deb9eba](https://github.com/theholocron/holocron/commit/deb9ebab5cb45a3a3650482a89737dd7f9ea272c)), closes [#1458](https://github.com/theholocron/holocron/issues/1458) [#1155](https://github.com/theholocron/holocron/issues/1155) [#1162](https://github.com/theholocron/holocron/issues/1162)

### Bug Fixes

* **cli:** 🐛 a plugin's missing token is a skip in every deep check ([#1468](https://github.com/theholocron/holocron/issues/1468)) ([6b1a5c2](https://github.com/theholocron/holocron/commit/6b1a5c2b40ceadbf452b1bd2b82e0984c33445a2)), closes [#1467](https://github.com/theholocron/holocron/issues/1467) [#1162](https://github.com/theholocron/holocron/issues/1162)

### Refactoring

* **pkg-utils:** ♻️ gather the pnpm-workspace readers ([#1466](https://github.com/theholocron/holocron/issues/1466)) ([49024cd](https://github.com/theholocron/holocron/commit/49024cdbe22625ea46f88b8071a32a398cd41c4b)), closes [#1240](https://github.com/theholocron/holocron/issues/1240) [#1240](https://github.com/theholocron/holocron/issues/1240)

### Documentation

* **cli:** 📚️ 📝 document the Checkly feed and relay steps of doctor notifications ([#1463](https://github.com/theholocron/holocron/issues/1463)) ([b22706a](https://github.com/theholocron/holocron/commit/b22706a21d0b787672bc7ab6a9b66e36da22ae54)), closes [#1458](https://github.com/theholocron/holocron/issues/1458) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.276](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.275...v5.0.0-alpha.276) (2026-10-31)

### Features

* **cli:** 🩺 doctor notifications checks the Checkly feed into Discord ([#1460](https://github.com/theholocron/holocron/issues/1460)) ([794013d](https://github.com/theholocron/holocron/commit/794013d08be09e1638c883be0fe2c02a4386ddd5)), closes [#1458](https://github.com/theholocron/holocron/issues/1458) [#1162](https://github.com/theholocron/holocron/issues/1162)

### Refactoring

* **pkg-utils:** ♻️ move workspace discovery out of astromech ([#1464](https://github.com/theholocron/holocron/issues/1464)) ([83f5889](https://github.com/theholocron/holocron/commit/83f5889746285b5cc47b8b8465e03c0aead442e2)), closes [#1240](https://github.com/theholocron/holocron/issues/1240)

### Documentation

* **cli:** 📝 spec for the Checkly feed and Comlink relay doctor checks ([#1459](https://github.com/theholocron/holocron/issues/1459)) ([028bdf7](https://github.com/theholocron/holocron/commit/028bdf739920531bdaf85c0e5892075388822e03)), closes [#1458](https://github.com/theholocron/holocron/issues/1458)

## [5.0.0-alpha.275](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.274...v5.0.0-alpha.275) (2026-10-31)

### Features

* **cli:** 🩺 doctor repo — check the repository settings match the config ([#1456](https://github.com/theholocron/holocron/issues/1456)) ([c157fbb](https://github.com/theholocron/holocron/commit/c157fbb34483e63bbd5fcfdf677f1c84fbeeaaf4)), closes [#1454](https://github.com/theholocron/holocron/issues/1454) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.274](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.273...v5.0.0-alpha.274) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor dns checks the DNS records the config makes setup write ([#1455](https://github.com/theholocron/holocron/issues/1455)) ([aac2939](https://github.com/theholocron/holocron/commit/aac2939bac8eedd02e1fe2f74668ee05a27039d0)), closes [#1451](https://github.com/theholocron/holocron/issues/1451) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.273](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.272...v5.0.0-alpha.273) (2026-10-31)

### Features

* **cli:** 🩺 doctor monitoring checks the declared checks exist in the account ([#1453](https://github.com/theholocron/holocron/issues/1453)) ([ca0d336](https://github.com/theholocron/holocron/commit/ca0d33676b7952671f90ab05d03d835639856df0)), closes [#1452](https://github.com/theholocron/holocron/issues/1452) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.272](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.271...v5.0.0-alpha.272) (2026-10-31)

### Features

* **cli:** 🔐 doctor secrets covers the keys secrets sync fills from a vault ([#1450](https://github.com/theholocron/holocron/issues/1450)) ([a7d8e12](https://github.com/theholocron/holocron/commit/a7d8e12108057ef2a105272e17538b7182816fcd)), closes [#1445](https://github.com/theholocron/holocron/issues/1445) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.271](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.270...v5.0.0-alpha.271) (2026-10-31)

### Features

* **cli:** 🩺 every plugin lists the tokens doctor tokens checks ([#1447](https://github.com/theholocron/holocron/issues/1447)) ([512660e](https://github.com/theholocron/holocron/commit/512660e08a48f06f499d59c010222cc0d8eb0040)), closes [#1448](https://github.com/theholocron/holocron/issues/1448) [#1444](https://github.com/theholocron/holocron/issues/1444) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.270](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.269...v5.0.0-alpha.270) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor environments checks the deployment environments exist ([#1448](https://github.com/theholocron/holocron/issues/1448)) ([bdcda8b](https://github.com/theholocron/holocron/commit/bdcda8bc664c06d1b1147e38787cc9714f6cc5e2))

## [5.0.0-alpha.269](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.268...v5.0.0-alpha.269) (2026-10-31)

### Features

* **cli:** ⏰ doctor tokens warns a week before a token expires ([#1449](https://github.com/theholocron/holocron/issues/1449)) ([8069eab](https://github.com/theholocron/holocron/commit/8069eab96c5a015440750d569965f1629f99008d))

## [5.0.0-alpha.268](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.267...v5.0.0-alpha.268) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor tokens checks each token a plugin takes is set and accepted ([#1441](https://github.com/theholocron/holocron/issues/1441)) ([07722f3](https://github.com/theholocron/holocron/commit/07722f342900257e181fc1739629554f5e4588cd)), closes [#1440](https://github.com/theholocron/holocron/issues/1440) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [5.0.0-alpha.267](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.266...v5.0.0-alpha.267) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor secrets checks the secrets the config relies on exist ([#1439](https://github.com/theholocron/holocron/issues/1439)) ([4aaa95c](https://github.com/theholocron/holocron/commit/4aaa95c279fc5b9338701a796af4182e6651a5db))

## [5.0.0-alpha.266](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.265...v5.0.0-alpha.266) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor --all runs every deep check ([#1437](https://github.com/theholocron/holocron/issues/1437)) ([3146e05](https://github.com/theholocron/holocron/commit/3146e057cf01ed13af5a2c7381b39c817e86dc13))

### Documentation

* **cli:** 📝 give every command its own docs page ([#1432](https://github.com/theholocron/holocron/issues/1432)) ([2047b8a](https://github.com/theholocron/holocron/commit/2047b8a168db12883458a931760f2f4581345d4f))

## [5.0.0-alpha.265](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.264...v5.0.0-alpha.265) (2026-10-31)

### Features

* **cli:** 🩺 holocron doctor variables checks the declared Actions variables ([#1434](https://github.com/theholocron/holocron/issues/1434)) ([c0a89ce](https://github.com/theholocron/holocron/commit/c0a89ceeba4a9feedbe06f4ca7167e4f75998775))

## [5.0.0-alpha.264](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.263...v5.0.0-alpha.264) (2026-10-31)

### Features

* **cli:** 🔎 holocron secrets list shows which secrets exist at each scope ([#1430](https://github.com/theholocron/holocron/issues/1430)) ([790b1d1](https://github.com/theholocron/holocron/commit/790b1d12d48c904d4c95bf522c9ca7902e277b27))

## [5.0.0-alpha.263](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.262...v5.0.0-alpha.263) (2026-10-31)

### Refactoring

* **cli:** ♻️ share the doctor check rows and list the deep checks in a registry ([#1429](https://github.com/theholocron/holocron/issues/1429)) ([e528d99](https://github.com/theholocron/holocron/commit/e528d991d3d35189a90458add64a694057efcae4))

### Chores

* **docs:** 🔧 point the docs site at docs.theholocron.dev/holocron and license it MIT ([#1428](https://github.com/theholocron/holocron/issues/1428)) ([8a67eab](https://github.com/theholocron/holocron/commit/8a67eab5705f48386e264bfec6d2ec5f349972e6))

## [5.0.0-alpha.262](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.261...v5.0.0-alpha.262) (2026-10-31)

### Features

* **cli:** ✨ holocron repo cleanup branches ([#1426](https://github.com/theholocron/holocron/issues/1426)) ([5e0d57f](https://github.com/theholocron/holocron/commit/5e0d57f4f200d303446adab6170b080bb87710ee)), closes [#1417](https://github.com/theholocron/holocron/issues/1417)

### Bug Fixes

* **astromech:** 🐛 key the Turbo cache by workflow and job ([#1427](https://github.com/theholocron/holocron/issues/1427)) ([4ac5c4a](https://github.com/theholocron/holocron/commit/4ac5c4a56a2a9b0be92b76332af987b619f26ddf)), closes [#1202](https://github.com/theholocron/holocron/issues/1202)

### Documentation

* 📝 carry the per-repo agent rules into the monorepo groups ([#1425](https://github.com/theholocron/holocron/issues/1425)) ([77f60e1](https://github.com/theholocron/holocron/commit/77f60e19f321a76dddc23d4840a25855e2729fce)), closes [#1394](https://github.com/theholocron/holocron/issues/1394) [#1394](https://github.com/theholocron/holocron/issues/1394)
* 📝 move the archived docs repo's specs into docs/wiki/specifications ([#1423](https://github.com/theholocron/holocron/issues/1423)) ([fee5640](https://github.com/theholocron/holocron/commit/fee56407851b38c73dbaa6fe04c397d6d5484d65)), closes [#1393](https://github.com/theholocron/holocron/issues/1393)
* 📝 update stale references to the archived repos and the old packages/ layout ([#1424](https://github.com/theholocron/holocron/issues/1424)) ([9858306](https://github.com/theholocron/holocron/commit/9858306ee93ba9282ff15a8f238bfb92c7c32861)), closes [#1217](https://github.com/theholocron/holocron/issues/1217) [#1395](https://github.com/theholocron/holocron/issues/1395)
* **ci:** 📝 record per-package Codecov flags and the create-report step in the affected-CI spec ([#1422](https://github.com/theholocron/holocron/issues/1422)) ([d0699f6](https://github.com/theholocron/holocron/commit/d0699f655806ad5786e650040d021da9238337a3)), closes [#1250](https://github.com/theholocron/holocron/issues/1250)

## [5.0.0-alpha.261](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.260...v5.0.0-alpha.261) (2026-10-30)

### Refactoring

* **cli:** ♻️ generate the files repo setup writes without a provider and check them for drift ([#1419](https://github.com/theholocron/holocron/issues/1419)) ([fc3c294](https://github.com/theholocron/holocron/commit/fc3c294ffadbda73b5e4c59a58c5bb7e7930da63)), closes [#1399](https://github.com/theholocron/holocron/issues/1399) [#1405](https://github.com/theholocron/holocron/issues/1405) [#1405](https://github.com/theholocron/holocron/issues/1405)

## [5.0.0-alpha.260](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.259...v5.0.0-alpha.260) (2026-10-30)

### Bug Fixes

* **astromech:** 🐛 create the Codecov commit and report before uploading per flag ([#1418](https://github.com/theholocron/holocron/issues/1418)) ([15c59da](https://github.com/theholocron/holocron/commit/15c59daa3e40f280da388dd929eb650bbe6761ad)), closes [#1250](https://github.com/theholocron/holocron/issues/1250)

## [5.0.0-alpha.259](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.258...v5.0.0-alpha.259) (2026-10-30)

### Bug Fixes

* **cloudflare:** 🐛 retry a read that gets a transient 5xx so repo setup does not fail on one ([#1414](https://github.com/theholocron/holocron/issues/1414)) ([55123d5](https://github.com/theholocron/holocron/commit/55123d5facaa1258883c01aa39c92c9305a64797)), closes [#1398](https://github.com/theholocron/holocron/issues/1398) [#1398](https://github.com/theholocron/holocron/issues/1398)
* **github:** 🐛 say which custom property value GitHub refused on a 422 ([#1413](https://github.com/theholocron/holocron/issues/1413)) ([b1735be](https://github.com/theholocron/holocron/commit/b1735be046c75540a2c5ed897fb8acdc903b229c)), closes [#1397](https://github.com/theholocron/holocron/issues/1397)

## [5.0.0-alpha.258](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.257...v5.0.0-alpha.258) (2026-10-30)

### Bug Fixes

* **platform:** 🐛 name the dependency catalogs job so it reports the status the ruleset requires ([#1409](https://github.com/theholocron/holocron/issues/1409)) ([ace7e19](https://github.com/theholocron/holocron/commit/ace7e192b07fada1b1fb5c3ed4b7c10c2085afc2)), closes [#1406](https://github.com/theholocron/holocron/issues/1406)

## [5.0.0-alpha.257](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.256...v5.0.0-alpha.257) (2026-10-30)

### Features

* **astromech:** ✨ scope turbo inputs and global dependencies ([#1404](https://github.com/theholocron/holocron/issues/1404)) ([1508796](https://github.com/theholocron/holocron/commit/1508796e6203b85d1a7fdf30a3d556e5dbbee2b9))

### Bug Fixes

* **cli:** 🐛 keep Dependabot from raising the plugins' peer floors ([#1401](https://github.com/theholocron/holocron/issues/1401)) ([b4b4622](https://github.com/theholocron/holocron/commit/b4b4622314a2017b2a935aac991095ed4231bc48)), closes [IgnoreCondition#ignored_versions](https://github.com/theholocron/IgnoreCondition/issues/ignored_versions) [#1400](https://github.com/theholocron/holocron/issues/1400)
* **cli:** 🐛 make repo setup and repo sync write identical generated files ([#1403](https://github.com/theholocron/holocron/issues/1403)) ([1c31248](https://github.com/theholocron/holocron/commit/1c312486249497527aa04fe168b0b07fcc574ede)), closes [#1399](https://github.com/theholocron/holocron/issues/1399)

## [5.0.0-alpha.256](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.255...v5.0.0-alpha.256) (2026-10-30)

### Features

* **astromech:** ✨ add holocron run --affected and base resolution ([#1392](https://github.com/theholocron/holocron/issues/1392)) ([e297185](https://github.com/theholocron/holocron/commit/e297185514b34b8b9f4cbe9a633e861faf4d8d05)), closes [#1232](https://github.com/theholocron/holocron/issues/1232)
* **cli:** ✨ add holocron probe deps and enforce the dependency catalogs in CI ([#1388](https://github.com/theholocron/holocron/issues/1388)) ([420efb6](https://github.com/theholocron/holocron/commit/420efb6fb9d8ebf26fed62fb5d59725167a1bf71)), closes [#1380](https://github.com/theholocron/holocron/issues/1380)

### Chores

* **platform:** 🗂️ organize the pnpm catalogs by group and add a who-uses-what report ([#1384](https://github.com/theholocron/holocron/issues/1384)) ([49246a3](https://github.com/theholocron/holocron/commit/49246a3ea3652a6db9539f947fd73a93c7c5370c)), closes [#1380](https://github.com/theholocron/holocron/issues/1380)

## [5.0.0-alpha.255](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.254...v5.0.0-alpha.255) (2026-10-29)

### Refactoring

* **sentinel:** ♻️ retire the package-registry check and its registry-doc dependency ([#1381](https://github.com/theholocron/holocron/issues/1381)) ([8e51ff2](https://github.com/theholocron/holocron/commit/8e51ff2a8e2fadacd3961baa6df993693dbf97e1)), closes [#1227](https://github.com/theholocron/holocron/issues/1227)

## [5.0.0-alpha.254](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.253...v5.0.0-alpha.254) (2026-10-29)

### Bug Fixes

* **astromech:** 🐛 set cache-mode on thin callers with low-trust triggers ([#1382](https://github.com/theholocron/holocron/issues/1382)) ([b5a6c56](https://github.com/theholocron/holocron/commit/b5a6c566a9747e00de7cf79a7f3955d372eda525)), closes [#1242](https://github.com/theholocron/holocron/issues/1242)
* **cli:** 🐛 bump-versions --group no longer reports folders outside the group as broken ([#1379](https://github.com/theholocron/holocron/issues/1379)) ([d8ec9b9](https://github.com/theholocron/holocron/commit/d8ec9b99acd5d701c949503aee258ff4112e6895)), closes [#1276](https://github.com/theholocron/holocron/issues/1276)

### Documentation

* **notes:** 📝 spec affected-only CI with Turborepo and Codecov flags ([#1383](https://github.com/theholocron/holocron/issues/1383)) ([67b7dbf](https://github.com/theholocron/holocron/commit/67b7dbfbad5748f4f31bfbe585991856a5a2f068)), closes [#1202](https://github.com/theholocron/holocron/issues/1202) [#1232](https://github.com/theholocron/holocron/issues/1232) [#1250](https://github.com/theholocron/holocron/issues/1250)

## [5.0.0-alpha.253](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.252...v5.0.0-alpha.253) (2026-10-29)

### Features

* **astro-config:** ✨ add apiReference and a plugins option ([#1376](https://github.com/theholocron/holocron/issues/1376)) ([d926523](https://github.com/theholocron/holocron/commit/d926523ff19017620b6e6a9025f6058f970c707e)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)
* **astromech:** ✨ switch a task's sub-jobs off per repo ([#1369](https://github.com/theholocron/holocron/issues/1369)) ([c3188ce](https://github.com/theholocron/holocron/commit/c3188cecd124a37dc3f5e17eaf485787b667c2d6)), closes [#1227](https://github.com/theholocron/holocron/issues/1227) [#1368](https://github.com/theholocron/holocron/issues/1368)
* **cli:** ✨ add holocron probe docs coverage and a Docs coverage check ([#1373](https://github.com/theholocron/holocron/issues/1373)) ([cdf6d1b](https://github.com/theholocron/holocron/commit/cdf6d1bb408a32963b70c1305bd2766bad6d3c65)), closes [#1368](https://github.com/theholocron/holocron/issues/1368)

### Chores

* **cli:** ♻️ scaffold plugins the way the existing ones are built now ([#1378](https://github.com/theholocron/holocron/issues/1378)) ([b9063f4](https://github.com/theholocron/holocron/commit/b9063f4d9f26749a14e47e0d903a92d9921717e6)), closes [#1364](https://github.com/theholocron/holocron/issues/1364)
* **platform:** ♻️ build every package from one root tsdown config ([#1375](https://github.com/theholocron/holocron/issues/1375)) ([d8e7a7d](https://github.com/theholocron/holocron/commit/d8e7a7dc87c377eefb2c7e5f29cbaed74f912666)), closes [#1364](https://github.com/theholocron/holocron/issues/1364)
* **platform:** ♻️ call the tools directly from the package scripts ([#1371](https://github.com/theholocron/holocron/issues/1371)) ([fceea7f](https://github.com/theholocron/holocron/commit/fceea7fa72cb542242aec2b7237f45d5d9e2192a)), closes [#1364](https://github.com/theholocron/holocron/issues/1364)
* **platform:** ♻️ resolve the in-repo packages from the workspace ([#1370](https://github.com/theholocron/holocron/issues/1370)) ([26c62c2](https://github.com/theholocron/holocron/commit/26c62c2b32124177339fecc2fdf66f808c1981c3)), closes [#1292](https://github.com/theholocron/holocron/issues/1292) [#1367](https://github.com/theholocron/holocron/issues/1367) [#1364](https://github.com/theholocron/holocron/issues/1364)

## [5.0.0-alpha.252](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.251...v5.0.0-alpha.252) (2026-10-29)

### Features

* **astromech:** ✨ let the ungrouped release start from the branch tip ([#1366](https://github.com/theholocron/holocron/issues/1366)) ([b137b01](https://github.com/theholocron/holocron/commit/b137b0181fbfce8956cf6e0443a660303e0666ef)), closes [#1364](https://github.com/theholocron/holocron/issues/1364)

## [5.0.0-alpha.251](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.250...v5.0.0-alpha.251) (2026-10-29)

### Refactoring

* **cli:** ♻️ read the sync-readme packages table from the workspace ([#1363](https://github.com/theholocron/holocron/issues/1363)) ([a61db87](https://github.com/theholocron/holocron/commit/a61db87a05a193ec547c0a1d57fc52ccf5576dab)), closes [#1228](https://github.com/theholocron/holocron/issues/1228)

### Documentation

* 📝 move the holocron site pages onto local components ([#1362](https://github.com/theholocron/holocron/issues/1362)) ([5040da0](https://github.com/theholocron/holocron/commit/5040da0b4e37d5eb49bca24e78644f3488924129)), closes [#1227](https://github.com/theholocron/holocron/issues/1227) [#1234](https://github.com/theholocron/holocron/issues/1234)
* **agents:** 📝 point the repo map at the folders in this monorepo ([#1358](https://github.com/theholocron/holocron/issues/1358)) ([84cc3bc](https://github.com/theholocron/holocron/commit/84cc3bc6016c6a5277c964faa724780391f01c96)), closes [#1321](https://github.com/theholocron/holocron/issues/1321)
* **configs:** 📝 move the package pages into the docs site ([8a3122f](https://github.com/theholocron/holocron/commit/8a3122ffd21ac5ee40add30442902c77129815cc)), closes [#1210](https://github.com/theholocron/holocron/issues/1210)
* **notes:** 📝 put the docs theme in themes/docs-theme in the consolidation spec ([7b31ca2](https://github.com/theholocron/holocron/commit/7b31ca23879f88a6df7d1dfa76368c1ce76abdbe)), closes [#1212](https://github.com/theholocron/holocron/issues/1212)
* **notes:** 📝 refresh the platform and observability specs ([#1323](https://github.com/theholocron/holocron/issues/1323)) ([738a2e7](https://github.com/theholocron/holocron/commit/738a2e71688749b305256d7200ce890a569f333d)), closes [#672](https://github.com/theholocron/holocron/issues/672) [675-#679](https://github.com/theholocron/675-/issues/679) [#681](https://github.com/theholocron/holocron/issues/681) [#680](https://github.com/theholocron/holocron/issues/680) [#763](https://github.com/theholocron/holocron/issues/763) [#765](https://github.com/theholocron/holocron/issues/765) [#767](https://github.com/theholocron/holocron/issues/767) [#1271](https://github.com/theholocron/holocron/issues/1271) [#1272](https://github.com/theholocron/holocron/issues/1272) [#634](https://github.com/theholocron/holocron/issues/634) [#1207](https://github.com/theholocron/holocron/issues/1207) [#638](https://github.com/theholocron/holocron/issues/638) [#633](https://github.com/theholocron/holocron/issues/633) [#637](https://github.com/theholocron/holocron/issues/637) [#1321](https://github.com/theholocron/holocron/issues/1321)
* **notes:** 🗂️ merge configs/.notes into the root and move the settled specs ([#1322](https://github.com/theholocron/holocron/issues/1322)) ([dd4642a](https://github.com/theholocron/holocron/commit/dd4642af6fb981a947e06ae203600404eb905bc2)), closes [#1288](https://github.com/theholocron/holocron/issues/1288) [#1271](https://github.com/theholocron/holocron/issues/1271) [#1272](https://github.com/theholocron/holocron/issues/1272) [#1051](https://github.com/theholocron/holocron/issues/1051) [#940](https://github.com/theholocron/holocron/issues/940) [#945](https://github.com/theholocron/holocron/issues/945) [#1010](https://github.com/theholocron/holocron/issues/1010) [#1321](https://github.com/theholocron/holocron/issues/1321)
* **skills:** 📝 rewrite the scaffolding skills for the monorepo ([#1359](https://github.com/theholocron/holocron/issues/1359)) ([1ca2d4c](https://github.com/theholocron/holocron/commit/1ca2d4c5c0a8c89642c35f84a3b13200a72e0cf4)), closes [#1357](https://github.com/theholocron/holocron/issues/1357) [#1200](https://github.com/theholocron/holocron/issues/1200)
* **themes:** 📝 move the docs-theme page into the docs site ([a01c2f3](https://github.com/theholocron/holocron/commit/a01c2f3ad9c34395d7ff6195d01becf0eb02ae4e)), closes [#1212](https://github.com/theholocron/holocron/issues/1212)

### Chores

* **apps:** 🏷️ set the private apps to version 0.0.0 ([#1320](https://github.com/theholocron/holocron/issues/1320)) ([8e73fcf](https://github.com/theholocron/holocron/commit/8e73fcfc06a0423871121a7820b3d3bb38b6b4dd))
* **configs:** 🔒 update the lockfile after rebasing onto clients ([670b5da](https://github.com/theholocron/holocron/commit/670b5da101261e5c8f8e0bca831e9a34f1b996e7))
* **configs:** 🔧 adapt the imported packages to the workspace ([90faa5b](https://github.com/theholocron/holocron/commit/90faa5b1b8ec04b80baf14afc8ae1e549dc32478)), closes [#1210](https://github.com/theholocron/holocron/issues/1210)
* **configs:** 🔧 meet the stricter package.json rules where it is safe ([23bdc67](https://github.com/theholocron/holocron/commit/23bdc67499a20e22cb4ef12c9d7c2ff183d2e6e7))
* **configs:** 🗂️ regenerate codecov.yml grouped by folder ([2f70095](https://github.com/theholocron/holocron/commit/2f70095d751fc6b6bc8a74f4fb213709450a1d7c))
* **themes:** 🔧 adapt the imported package to the workspace ([2e7a534](https://github.com/theholocron/holocron/commit/2e7a534eb20daf3da2c9ba73eeef0d6c9e51fbad)), closes [#1212](https://github.com/theholocron/holocron/issues/1212)

## [5.0.0-alpha.250](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.249...v5.0.0-alpha.250) (2026-10-29)

### Bug Fixes

* **google-client:** 🐛 move googleapis and google-auth-library to current releases together ([#1295](https://github.com/theholocron/holocron/issues/1295)) ([97b5160](https://github.com/theholocron/holocron/commit/97b5160f97ed942ac5c2d442da08cb5adb1ead73)), closes [#1289](https://github.com/theholocron/holocron/issues/1289) [#1294](https://github.com/theholocron/holocron/issues/1294)

### Documentation

* **clients:** 📝 move the package pages into the docs site ([1ef9d41](https://github.com/theholocron/holocron/commit/1ef9d41be303615ddfdd62cc8faf4b615b298202)), closes [#1211](https://github.com/theholocron/holocron/issues/1211)

### Chores

* **astromech:** 🗂️ group codecov components by folder ([#1290](https://github.com/theholocron/holocron/issues/1290)) ([0e2c680](https://github.com/theholocron/holocron/commit/0e2c680426e7bd1852e42c3d4fe62df9a778fbf5))
* **clients:** 🔧 adapt the imported packages to the workspace ([00f5dc3](https://github.com/theholocron/holocron/commit/00f5dc3e4a9016af8922432bd6e9faeb961cce7b)), closes [#1211](https://github.com/theholocron/holocron/issues/1211)

## [5.0.0-alpha.249](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.248...v5.0.0-alpha.249) (2026-10-29)

### Documentation

* **utils:** 📝 move the package pages into the docs site ([dcdf180](https://github.com/theholocron/holocron/commit/dcdf18090c1998aa4ad8cb5d17de5dd129c746d2)), closes [#1209](https://github.com/theholocron/holocron/issues/1209)

### Chores

* **deps:** Bump @sentry/node from 10.75.2 to 11.9.0 ([#1244](https://github.com/theholocron/holocron/issues/1244)) ([6e13477](https://github.com/theholocron/holocron/commit/6e1347724d8187d6c923db6157327f7f54433935))
* **deps:** Bump happy-dom ([#1280](https://github.com/theholocron/holocron/issues/1280)) ([e61d2bd](https://github.com/theholocron/holocron/commit/e61d2bdf7706724e11086003f3f9472c362552cb))
* **deps:** Bump posthog-node ([#1248](https://github.com/theholocron/holocron/issues/1248)) ([74be439](https://github.com/theholocron/holocron/commit/74be4399109a424895ad483db867e2f5bcf2dcce))
* **utils:** 🔧 adapt the imported packages to the workspace ([b4a71e8](https://github.com/theholocron/holocron/commit/b4a71e89fcb8c0606ea9496c48f900faf2c9923e)), closes [#1209](https://github.com/theholocron/holocron/issues/1209)

## [5.0.0-alpha.248](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.247...v5.0.0-alpha.248) (2026-10-29)

### Bug Fixes

* **cli:** 🐛 re-register packages bound to another repo with --sync-trust ([#1274](https://github.com/theholocron/holocron/issues/1274)) ([e8aefeb](https://github.com/theholocron/holocron/commit/e8aefeb865acff7c3c379b89eebb08dcf75dad9b)), closes [#1221](https://github.com/theholocron/holocron/issues/1221)

## [5.0.0-alpha.247](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.246...v5.0.0-alpha.247) (2026-10-29)

### Chores

* **deps:** ⬆️ bump vitest to 5.0.5 and tsdown to 0.23.3 ([#1273](https://github.com/theholocron/holocron/issues/1273)) ([727c699](https://github.com/theholocron/holocron/commit/727c699300a4738ecd005dc6f6b3857b9cbcc176)), closes [#1225](https://github.com/theholocron/holocron/issues/1225)

## [5.0.0-alpha.246](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.245...v5.0.0-alpha.246) (2026-10-29)

### Features

* **cli:** ✨ export the holocron-config presets from the CLI ([#1272](https://github.com/theholocron/holocron/issues/1272)) ([f7332f2](https://github.com/theholocron/holocron/commit/f7332f2e93677ab2e41a3525b71025599db279e8)), closes [#1271](https://github.com/theholocron/holocron/issues/1271) [#1229](https://github.com/theholocron/holocron/issues/1229)

### Documentation

* **adr:** 📝 ADR-0016 MIT as the unified license ([#1269](https://github.com/theholocron/holocron/issues/1269)) ([f64328c](https://github.com/theholocron/holocron/commit/f64328cdb7096f150d76ed839886b3271cb41000)), closes [#1206](https://github.com/theholocron/holocron/issues/1206)

## [5.0.0-alpha.245](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.244...v5.0.0-alpha.245) (2026-10-29)

### Bug Fixes

* **astromech:** 🐛 load the wrapped release plugins the way semantic-release does ([#1261](https://github.com/theholocron/holocron/issues/1261)) ([b6ad3e5](https://github.com/theholocron/holocron/commit/b6ad3e551302a43ffa19f71678cb35e77407e142))

### Documentation

* **skills:** 📝 move the skill pages into the docs site ([52eea91](https://github.com/theholocron/holocron/commit/52eea916cec61ca5cec08b7d090720c35f2b6286)), closes [#1208](https://github.com/theholocron/holocron/issues/1208)

### Chores

* **skills:** 🔧 adapt the imported package to the workspace ([c2fd6b5](https://github.com/theholocron/holocron/commit/c2fd6b569e67e5abca8a8f208fe09bc52e9a9daa)), closes [#1208](https://github.com/theholocron/holocron/issues/1208)
* **skills:** 🔧 satisfy the package.json lint rules ([9d08d2a](https://github.com/theholocron/holocron/commit/9d08d2a00ffe02bb059452620bea9594bc98a8ac)), closes [#1208](https://github.com/theholocron/holocron/issues/1208)

## [5.0.0-alpha.244](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.243...v5.0.0-alpha.244) (2026-10-29)

### Bug Fixes

* **astromech:** 🐛 comment only on the PRs a release actually contains ([#1259](https://github.com/theholocron/holocron/issues/1259)) ([2bbffee](https://github.com/theholocron/holocron/commit/2bbffeec45381af1987737556dd931a7ed802412))

### Documentation

* **observability:** 📝 move the package docs into the docs site ([88adf03](https://github.com/theholocron/holocron/commit/88adf03ec2e1d7c0e4a950cca14358fa26139a35)), closes [#1207](https://github.com/theholocron/holocron/issues/1207)
* **observability:** 📝 use .mdx for the package pages like the rest of the docs ([20a7f88](https://github.com/theholocron/holocron/commit/20a7f88bf5d94edf5e2e65a884da897e3a6641b7)), closes [#1207](https://github.com/theholocron/holocron/issues/1207)

### Chores

* **observability:** 🔧 adapt the imported package to the workspace ([f97e601](https://github.com/theholocron/holocron/commit/f97e601ae2fccbc665bcb5d8315bbaabd8642c20)), closes [#1207](https://github.com/theholocron/holocron/issues/1207)

## [5.0.0-alpha.243](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.242...v5.0.0-alpha.243) (2026-10-28)

### Bug Fixes

* **release:** 🐛 stop prettier checking the generated CHANGELOG.md ([#1252](https://github.com/theholocron/holocron/issues/1252)) ([ccbdece](https://github.com/theholocron/holocron/commit/ccbdece50b813d8f2ab7e1f6cd5a0c721a19ec82)), closes [#1249](https://github.com/theholocron/holocron/issues/1249) [#1245](https://github.com/theholocron/holocron/issues/1245)

## [5.0.0-alpha.242](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.241...v5.0.0-alpha.242) (2026-10-28)

### Bug Fixes

* **release:** 🐛 pin the conventionalcommits preset to 9.3.1 so release notes list commits ([#1249](https://github.com/theholocron/holocron/issues/1249)) ([de22c86](https://github.com/theholocron/holocron/commit/de22c86250b11661d80aceb2c9691b32f77fe828)), closes [#1245](https://github.com/theholocron/holocron/issues/1245)

## [5.0.0-alpha.241](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.240...v5.0.0-alpha.241) (2026-10-28)

## [5.0.0-alpha.240](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.239...v5.0.0-alpha.240) (2026-10-28)

## [5.0.0-alpha.239](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.238...v5.0.0-alpha.239) (2026-10-28)

## [5.0.0-alpha.238](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.237...v5.0.0-alpha.238) (2026-10-28)

## [5.0.0-alpha.237](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.236...v5.0.0-alpha.237) (2026-10-28)

## [5.0.0-alpha.236](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.235...v5.0.0-alpha.236) (2026-10-28)

## [5.0.0-alpha.235](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.234...v5.0.0-alpha.235) (2026-10-28)

## [5.0.0-alpha.234](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.233...v5.0.0-alpha.234) (2026-10-28)

## [5.0.0-alpha.233](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.232...v5.0.0-alpha.233) (2026-10-28)

## [5.0.0-alpha.232](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.231...v5.0.0-alpha.232) (2026-10-28)

## [5.0.0-alpha.231](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.230...v5.0.0-alpha.231) (2026-10-28)

## [5.0.0-alpha.230](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.229...v5.0.0-alpha.230) (2026-10-27)

## [5.0.0-alpha.229](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.228...v5.0.0-alpha.229) (2026-10-27)

## [5.0.0-alpha.228](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.227...v5.0.0-alpha.228) (2026-10-27)

## [5.0.0-alpha.227](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.226...v5.0.0-alpha.227) (2026-10-27)

## [5.0.0-alpha.226](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.225...v5.0.0-alpha.226) (2026-10-27)

## [5.0.0-alpha.225](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.224...v5.0.0-alpha.225) (2026-10-27)

## [5.0.0-alpha.224](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.223...v5.0.0-alpha.224) (2026-10-27)

## [5.0.0-alpha.223](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.222...v5.0.0-alpha.223) (2026-10-27)

## [5.0.0-alpha.222](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.221...v5.0.0-alpha.222) (2026-10-27)

## [5.0.0-alpha.221](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.220...v5.0.0-alpha.221) (2026-10-27)

## [5.0.0-alpha.220](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.219...v5.0.0-alpha.220) (2026-10-27)

## [5.0.0-alpha.219](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.218...v5.0.0-alpha.219) (2026-10-27)

## [5.0.0-alpha.218](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.217...v5.0.0-alpha.218) (2026-10-27)

## [5.0.0-alpha.217](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.216...v5.0.0-alpha.217) (2026-10-27)

## [5.0.0-alpha.216](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.215...v5.0.0-alpha.216) (2026-10-26)

## [5.0.0-alpha.215](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.214...v5.0.0-alpha.215) (2026-10-26)

## [5.0.0-alpha.214](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.213...v5.0.0-alpha.214) (2026-10-26)

## [5.0.0-alpha.213](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.212...v5.0.0-alpha.213) (2026-10-26)

## [5.0.0-alpha.212](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.211...v5.0.0-alpha.212) (2026-10-26)

## [5.0.0-alpha.211](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.210...v5.0.0-alpha.211) (2026-10-26)

## [5.0.0-alpha.210](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.209...v5.0.0-alpha.210) (2026-10-26)

## [5.0.0-alpha.209](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.208...v5.0.0-alpha.209) (2026-10-26)

## [5.0.0-alpha.208](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.207...v5.0.0-alpha.208) (2026-10-26)

## [5.0.0-alpha.207](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.206...v5.0.0-alpha.207) (2026-10-26)

## [5.0.0-alpha.206](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.205...v5.0.0-alpha.206) (2026-10-26)

## [5.0.0-alpha.205](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.204...v5.0.0-alpha.205) (2026-10-26)

## [5.0.0-alpha.204](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.203...v5.0.0-alpha.204) (2026-10-26)

## [5.0.0-alpha.203](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.202...v5.0.0-alpha.203) (2026-10-25)

## [5.0.0-alpha.202](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.201...v5.0.0-alpha.202) (2026-10-25)

## [5.0.0-alpha.201](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.200...v5.0.0-alpha.201) (2026-10-25)

## [5.0.0-alpha.200](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.199...v5.0.0-alpha.200) (2026-10-25)

## [5.0.0-alpha.199](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.198...v5.0.0-alpha.199) (2026-10-24)

## [5.0.0-alpha.198](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.197...v5.0.0-alpha.198) (2026-10-24)

## [5.0.0-alpha.197](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.196...v5.0.0-alpha.197) (2026-10-24)

## [5.0.0-alpha.196](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.195...v5.0.0-alpha.196) (2026-10-24)

## [5.0.0-alpha.195](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.194...v5.0.0-alpha.195) (2026-10-24)

## [5.0.0-alpha.194](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.193...v5.0.0-alpha.194) (2026-10-24)

## [5.0.0-alpha.193](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.192...v5.0.0-alpha.193) (2026-10-24)

## [5.0.0-alpha.192](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.191...v5.0.0-alpha.192) (2026-10-24)

## [5.0.0-alpha.191](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.190...v5.0.0-alpha.191) (2026-10-24)

## [5.0.0-alpha.190](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.189...v5.0.0-alpha.190) (2026-10-23)

## [5.0.0-alpha.189](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.188...v5.0.0-alpha.189) (2026-10-23)

## [5.0.0-alpha.188](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.187...v5.0.0-alpha.188) (2026-10-23)

## [5.0.0-alpha.187](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.186...v5.0.0-alpha.187) (2026-10-23)

## [5.0.0-alpha.186](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.185...v5.0.0-alpha.186) (2026-10-23)

## [5.0.0-alpha.185](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.184...v5.0.0-alpha.185) (2026-10-23)

## [5.0.0-alpha.184](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.183...v5.0.0-alpha.184) (2026-10-22)

## [5.0.0-alpha.183](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.182...v5.0.0-alpha.183) (2026-10-22)

## [5.0.0-alpha.182](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.181...v5.0.0-alpha.182) (2026-10-22)

## [5.0.0-alpha.181](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.180...v5.0.0-alpha.181) (2026-10-22)

## [5.0.0-alpha.180](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.179...v5.0.0-alpha.180) (2026-10-22)

## [5.0.0-alpha.179](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.178...v5.0.0-alpha.179) (2026-10-22)

## [5.0.0-alpha.178](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.177...v5.0.0-alpha.178) (2026-10-22)

## [5.0.0-alpha.177](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.176...v5.0.0-alpha.177) (2026-10-22)

## [5.0.0-alpha.176](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.175...v5.0.0-alpha.176) (2026-10-22)

## [5.0.0-alpha.175](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.174...v5.0.0-alpha.175) (2026-10-22)

## [5.0.0-alpha.174](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.173...v5.0.0-alpha.174) (2026-10-22)

## [5.0.0-alpha.173](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.172...v5.0.0-alpha.173) (2026-10-21)

## [5.0.0-alpha.172](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.171...v5.0.0-alpha.172) (2026-10-21)

## [5.0.0-alpha.171](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.170...v5.0.0-alpha.171) (2026-10-21)

## [5.0.0-alpha.170](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.169...v5.0.0-alpha.170) (2026-10-20)

## [5.0.0-alpha.169](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.168...v5.0.0-alpha.169) (2026-10-20)

## [5.0.0-alpha.168](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.167...v5.0.0-alpha.168) (2026-10-20)

## [5.0.0-alpha.167](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.166...v5.0.0-alpha.167) (2026-10-20)

## [5.0.0-alpha.166](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.165...v5.0.0-alpha.166) (2026-10-20)

## [5.0.0-alpha.165](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.164...v5.0.0-alpha.165) (2026-10-20)

## [5.0.0-alpha.164](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.163...v5.0.0-alpha.164) (2026-10-20)

## [5.0.0-alpha.163](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.162...v5.0.0-alpha.163) (2026-10-20)

## [5.0.0-alpha.162](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.161...v5.0.0-alpha.162) (2026-10-19)

## [5.0.0-alpha.161](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.160...v5.0.0-alpha.161) (2026-10-19)

## [5.0.0-alpha.160](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.159...v5.0.0-alpha.160) (2026-10-19)

## [5.0.0-alpha.159](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.158...v5.0.0-alpha.159) (2026-10-17)

## [5.0.0-alpha.158](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.157...v5.0.0-alpha.158) (2026-10-17)

## [5.0.0-alpha.157](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.156...v5.0.0-alpha.157) (2026-10-17)

## [5.0.0-alpha.156](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.155...v5.0.0-alpha.156) (2026-10-17)

## [5.0.0-alpha.155](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.154...v5.0.0-alpha.155) (2026-10-17)

## [5.0.0-alpha.154](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.153...v5.0.0-alpha.154) (2026-10-17)

## [5.0.0-alpha.153](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.152...v5.0.0-alpha.153) (2026-10-16)

## [5.0.0-alpha.152](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.151...v5.0.0-alpha.152) (2026-10-16)

## [5.0.0-alpha.151](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.150...v5.0.0-alpha.151) (2026-10-16)

## [5.0.0-alpha.150](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.149...v5.0.0-alpha.150) (2026-10-16)

## [5.0.0-alpha.149](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.148...v5.0.0-alpha.149) (2026-10-15)

## [5.0.0-alpha.148](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.147...v5.0.0-alpha.148) (2026-10-15)

## [5.0.0-alpha.147](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.146...v5.0.0-alpha.147) (2026-10-15)

## [5.0.0-alpha.146](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.145...v5.0.0-alpha.146) (2026-10-14)

## [5.0.0-alpha.145](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.144...v5.0.0-alpha.145) (2026-10-14)

## [5.0.0-alpha.144](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.143...v5.0.0-alpha.144) (2026-10-13)

## [5.0.0-alpha.143](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.142...v5.0.0-alpha.143) (2026-10-13)

## [5.0.0-alpha.142](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.141...v5.0.0-alpha.142) (2026-10-13)

## [5.0.0-alpha.141](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.140...v5.0.0-alpha.141) (2026-10-13)

## [5.0.0-alpha.140](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.139...v5.0.0-alpha.140) (2026-10-13)

## [5.0.0-alpha.139](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.138...v5.0.0-alpha.139) (2026-10-13)

## [5.0.0-alpha.138](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.137...v5.0.0-alpha.138) (2026-10-13)

## [5.0.0-alpha.137](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.136...v5.0.0-alpha.137) (2026-10-13)

## [5.0.0-alpha.136](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.135...v5.0.0-alpha.136) (2026-10-13)

## [5.0.0-alpha.135](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.134...v5.0.0-alpha.135) (2026-10-13)

## [5.0.0-alpha.134](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.133...v5.0.0-alpha.134) (2026-10-13)

## [5.0.0-alpha.133](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.132...v5.0.0-alpha.133) (2026-10-12)

## [5.0.0-alpha.132](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.131...v5.0.0-alpha.132) (2026-10-12)

## [5.0.0-alpha.131](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.130...v5.0.0-alpha.131) (2026-10-10)

## [5.0.0-alpha.130](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.129...v5.0.0-alpha.130) (2026-10-10)

## [5.0.0-alpha.129](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.128...v5.0.0-alpha.129) (2026-10-10)

## [5.0.0-alpha.128](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.127...v5.0.0-alpha.128) (2026-10-09)

## [5.0.0-alpha.127](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.126...v5.0.0-alpha.127) (2026-10-08)

## [5.0.0-alpha.126](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.125...v5.0.0-alpha.126) (2026-10-08)

## [5.0.0-alpha.125](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.124...v5.0.0-alpha.125) (2026-10-08)

## [5.0.0-alpha.124](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.123...v5.0.0-alpha.124) (2026-10-08)

## [5.0.0-alpha.123](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.122...v5.0.0-alpha.123) (2026-10-08)

## [5.0.0-alpha.122](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.121...v5.0.0-alpha.122) (2026-10-08)

## [5.0.0-alpha.121](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.120...v5.0.0-alpha.121) (2026-10-07)

## [5.0.0-alpha.120](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.119...v5.0.0-alpha.120) (2026-10-07)

## [5.0.0-alpha.119](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.118...v5.0.0-alpha.119) (2026-10-07)

## [5.0.0-alpha.118](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.117...v5.0.0-alpha.118) (2026-10-07)

## [5.0.0-alpha.117](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.116...v5.0.0-alpha.117) (2026-10-07)

## [5.0.0-alpha.116](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.115...v5.0.0-alpha.116) (2026-10-07)

## [5.0.0-alpha.115](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.114...v5.0.0-alpha.115) (2026-10-07)

## [5.0.0-alpha.114](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.113...v5.0.0-alpha.114) (2026-10-06)

## [5.0.0-alpha.113](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.112...v5.0.0-alpha.113) (2026-10-06)

## [5.0.0-alpha.112](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.111...v5.0.0-alpha.112) (2026-10-06)

## [5.0.0-alpha.111](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.110...v5.0.0-alpha.111) (2026-10-06)

## [5.0.0-alpha.110](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.109...v5.0.0-alpha.110) (2026-10-06)

## [5.0.0-alpha.109](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.108...v5.0.0-alpha.109) (2026-10-05)

## [5.0.0-alpha.108](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.107...v5.0.0-alpha.108) (2026-10-05)

## [5.0.0-alpha.107](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.106...v5.0.0-alpha.107) (2026-10-05)

## [5.0.0-alpha.106](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.105...v5.0.0-alpha.106) (2026-10-05)

## [5.0.0-alpha.105](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.104...v5.0.0-alpha.105) (2026-10-03)

## [5.0.0-alpha.104](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.103...v5.0.0-alpha.104) (2026-10-03)

## [5.0.0-alpha.103](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.102...v5.0.0-alpha.103) (2026-10-03)

## [5.0.0-alpha.102](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.101...v5.0.0-alpha.102) (2026-10-03)

## [5.0.0-alpha.101](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.100...v5.0.0-alpha.101) (2026-10-02)

## [5.0.0-alpha.100](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.99...v5.0.0-alpha.100) (2026-10-02)

## [5.0.0-alpha.99](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.98...v5.0.0-alpha.99) (2026-10-02)

## [5.0.0-alpha.98](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.97...v5.0.0-alpha.98) (2026-10-02)

## [5.0.0-alpha.97](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.96...v5.0.0-alpha.97) (2026-10-02)

## [5.0.0-alpha.96](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.95...v5.0.0-alpha.96) (2026-10-02)

## [5.0.0-alpha.95](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.94...v5.0.0-alpha.95) (2026-10-01)

## [5.0.0-alpha.94](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.93...v5.0.0-alpha.94) (2026-10-01)

## [5.0.0-alpha.93](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.92...v5.0.0-alpha.93) (2026-10-01)

## [5.0.0-alpha.92](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.91...v5.0.0-alpha.92) (2026-10-01)

## [5.0.0-alpha.91](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.90...v5.0.0-alpha.91) (2026-10-01)

## [5.0.0-alpha.90](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.89...v5.0.0-alpha.90) (2026-10-01)

## [5.0.0-alpha.89](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.88...v5.0.0-alpha.89) (2026-10-01)

## [5.0.0-alpha.88](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.87...v5.0.0-alpha.88) (2026-09-30)

## [5.0.0-alpha.87](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.86...v5.0.0-alpha.87) (2026-09-30)

## [5.0.0-alpha.86](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.85...v5.0.0-alpha.86) (2026-09-30)

## [5.0.0-alpha.85](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.84...v5.0.0-alpha.85) (2026-09-30)

## [5.0.0-alpha.84](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.83...v5.0.0-alpha.84) (2026-09-30)

## [5.0.0-alpha.83](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.82...v5.0.0-alpha.83) (2026-09-30)

## [5.0.0-alpha.82](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.81...v5.0.0-alpha.82) (2026-09-30)

## [5.0.0-alpha.81](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.80...v5.0.0-alpha.81) (2026-09-29)

## [5.0.0-alpha.80](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.79...v5.0.0-alpha.80) (2026-09-29)

## [5.0.0-alpha.79](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.78...v5.0.0-alpha.79) (2026-09-29)

## [5.0.0-alpha.78](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.77...v5.0.0-alpha.78) (2026-09-29)

## [5.0.0-alpha.77](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.76...v5.0.0-alpha.77) (2026-09-28)

## [5.0.0-alpha.76](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.75...v5.0.0-alpha.76) (2026-09-27)

## [5.0.0-alpha.75](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.74...v5.0.0-alpha.75) (2026-09-27)

## [5.0.0-alpha.74](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.73...v5.0.0-alpha.74) (2026-09-26)

## [5.0.0-alpha.73](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.72...v5.0.0-alpha.73) (2026-09-26)

## [5.0.0-alpha.72](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.71...v5.0.0-alpha.72) (2026-09-26)

## [5.0.0-alpha.71](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.70...v5.0.0-alpha.71) (2026-09-26)

## [5.0.0-alpha.70](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.69...v5.0.0-alpha.70) (2026-09-26)

## [5.0.0-alpha.69](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.68...v5.0.0-alpha.69) (2026-09-26)

## [5.0.0-alpha.68](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.67...v5.0.0-alpha.68) (2026-09-26)

## [5.0.0-alpha.67](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.66...v5.0.0-alpha.67) (2026-09-26)

## [5.0.0-alpha.66](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.65...v5.0.0-alpha.66) (2026-09-26)

## [5.0.0-alpha.65](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.64...v5.0.0-alpha.65) (2026-09-26)

## [5.0.0-alpha.64](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.63...v5.0.0-alpha.64) (2026-09-26)

## [5.0.0-alpha.63](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.62...v5.0.0-alpha.63) (2026-09-25)

## [5.0.0-alpha.62](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.61...v5.0.0-alpha.62) (2026-09-25)

## [5.0.0-alpha.61](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.60...v5.0.0-alpha.61) (2026-09-25)

## [5.0.0-alpha.60](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.59...v5.0.0-alpha.60) (2026-09-25)

## [5.0.0-alpha.59](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.58...v5.0.0-alpha.59) (2026-09-25)

## [5.0.0-alpha.58](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.57...v5.0.0-alpha.58) (2026-09-25)

## [5.0.0-alpha.57](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.56...v5.0.0-alpha.57) (2026-09-24)

## [5.0.0-alpha.56](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.55...v5.0.0-alpha.56) (2026-09-24)

## [5.0.0-alpha.55](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.54...v5.0.0-alpha.55) (2026-09-24)

## [5.0.0-alpha.54](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.53...v5.0.0-alpha.54) (2026-09-24)

## [5.0.0-alpha.53](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.52...v5.0.0-alpha.53) (2026-09-23)

## [5.0.0-alpha.52](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.51...v5.0.0-alpha.52) (2026-09-23)

## [5.0.0-alpha.51](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.50...v5.0.0-alpha.51) (2026-09-23)

## [5.0.0-alpha.50](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.49...v5.0.0-alpha.50) (2026-09-23)

## [5.0.0-alpha.49](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.48...v5.0.0-alpha.49) (2026-09-23)

## [5.0.0-alpha.48](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.47...v5.0.0-alpha.48) (2026-09-22)

## [5.0.0-alpha.47](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.46...v5.0.0-alpha.47) (2026-09-22)

## [5.0.0-alpha.46](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.45...v5.0.0-alpha.46) (2026-09-22)

## [5.0.0-alpha.45](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.44...v5.0.0-alpha.45) (2026-09-22)

## [5.0.0-alpha.44](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.43...v5.0.0-alpha.44) (2026-09-22)

## [5.0.0-alpha.43](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.42...v5.0.0-alpha.43) (2026-09-22)

## [5.0.0-alpha.42](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.41...v5.0.0-alpha.42) (2026-09-22)

## [5.0.0-alpha.41](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.40...v5.0.0-alpha.41) (2026-09-21)

## [5.0.0-alpha.40](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.39...v5.0.0-alpha.40) (2026-09-21)

## [5.0.0-alpha.39](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.38...v5.0.0-alpha.39) (2026-09-21)

## [5.0.0-alpha.38](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.37...v5.0.0-alpha.38) (2026-09-21)

## [5.0.0-alpha.37](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.36...v5.0.0-alpha.37) (2026-09-21)

## [5.0.0-alpha.36](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.35...v5.0.0-alpha.36) (2026-09-21)

## [5.0.0-alpha.35](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.34...v5.0.0-alpha.35) (2026-09-21)

## [5.0.0-alpha.34](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.33...v5.0.0-alpha.34) (2026-09-21)

## [5.0.0-alpha.33](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.32...v5.0.0-alpha.33) (2026-09-21)

## [5.0.0-alpha.32](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.31...v5.0.0-alpha.32) (2026-09-21)

## [5.0.0-alpha.31](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.30...v5.0.0-alpha.31) (2026-09-20)

## [5.0.0-alpha.30](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.29...v5.0.0-alpha.30) (2026-09-20)

## [5.0.0-alpha.29](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.28...v5.0.0-alpha.29) (2026-09-20)

## [5.0.0-alpha.28](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.27...v5.0.0-alpha.28) (2026-09-20)

## [5.0.0-alpha.27](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.26...v5.0.0-alpha.27) (2026-09-17)

## [5.0.0-alpha.26](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.25...v5.0.0-alpha.26) (2026-09-17)

## [5.0.0-alpha.25](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.24...v5.0.0-alpha.25) (2026-09-17)

## [5.0.0-alpha.24](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.23...v5.0.0-alpha.24) (2026-09-17)

## [5.0.0-alpha.23](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.22...v5.0.0-alpha.23) (2026-09-17)

## [5.0.0-alpha.22](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.21...v5.0.0-alpha.22) (2026-09-17)

## [5.0.0-alpha.21](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.20...v5.0.0-alpha.21) (2026-09-17)

## [5.0.0-alpha.20](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.19...v5.0.0-alpha.20) (2026-09-17)

## [5.0.0-alpha.19](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.18...v5.0.0-alpha.19) (2026-09-16)

## [5.0.0-alpha.18](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.17...v5.0.0-alpha.18) (2026-09-16)

## [5.0.0-alpha.17](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.16...v5.0.0-alpha.17) (2026-09-16)

## [5.0.0-alpha.16](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.15...v5.0.0-alpha.16) (2026-09-16)

## [5.0.0-alpha.15](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.14...v5.0.0-alpha.15) (2026-09-16)

## [5.0.0-alpha.14](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.13...v5.0.0-alpha.14) (2026-09-16)

## [5.0.0-alpha.13](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.12...v5.0.0-alpha.13) (2026-09-16)

## [5.0.0-alpha.12](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.11...v5.0.0-alpha.12) (2026-09-16)

## [5.0.0-alpha.11](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.10...v5.0.0-alpha.11) (2026-09-16)

## [5.0.0-alpha.10](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.9...v5.0.0-alpha.10) (2026-09-16)

## [5.0.0-alpha.9](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.8...v5.0.0-alpha.9) (2026-09-15)

## [5.0.0-alpha.8](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.7...v5.0.0-alpha.8) (2026-09-15)

## [5.0.0-alpha.7](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.6...v5.0.0-alpha.7) (2026-09-15)

## [5.0.0-alpha.6](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.5...v5.0.0-alpha.6) (2026-09-15)

## [5.0.0-alpha.5](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.4...v5.0.0-alpha.5) (2026-09-15)

## [5.0.0-alpha.4](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.3...v5.0.0-alpha.4) (2026-09-15)

## [5.0.0-alpha.3](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.2...v5.0.0-alpha.3) (2026-09-15)

## [5.0.0-alpha.2](https://github.com/theholocron/holocron/compare/v5.0.0-alpha.1...v5.0.0-alpha.2) (2026-09-15)

## [5.0.0-alpha.1](https://github.com/theholocron/holocron/compare/v4.19.0...v5.0.0-alpha.1) (2026-09-15)

## [4.19.0](https://github.com/theholocron/holocron/compare/v4.18.3...v4.19.0) (2026-09-11)

## [4.18.3](https://github.com/theholocron/holocron/compare/v4.18.2...v4.18.3) (2026-09-11)

## [4.18.2](https://github.com/theholocron/holocron/compare/v4.18.1...v4.18.2) (2026-09-11)

## [4.18.1](https://github.com/theholocron/holocron/compare/v4.18.0...v4.18.1) (2026-09-11)

## [4.18.0](https://github.com/theholocron/holocron/compare/v4.17.2...v4.18.0) (2026-09-11)

## [4.17.2](https://github.com/theholocron/holocron/compare/v4.17.1...v4.17.2) (2026-09-11)

## [4.17.1](https://github.com/theholocron/holocron/compare/v4.17.0...v4.17.1) (2026-09-11)

## [4.17.0](https://github.com/theholocron/holocron/compare/v4.16.5...v4.17.0) (2026-09-11)

## [4.16.5](https://github.com/theholocron/holocron/compare/v4.16.4...v4.16.5) (2026-09-11)

## [4.16.4](https://github.com/theholocron/holocron/compare/v4.16.3...v4.16.4) (2026-09-11)

## [4.16.3](https://github.com/theholocron/holocron/compare/v4.16.2...v4.16.3) (2026-09-10)

## [4.16.2](https://github.com/theholocron/holocron/compare/v4.16.1...v4.16.2) (2026-09-10)

## [4.16.1](https://github.com/theholocron/holocron/compare/v4.16.0...v4.16.1) (2026-09-10)

## [4.16.0](https://github.com/theholocron/holocron/compare/v4.15.0...v4.16.0) (2026-09-10)

## [4.15.0](https://github.com/theholocron/holocron/compare/v4.14.1...v4.15.0) (2026-09-10)

## [4.14.1](https://github.com/theholocron/holocron/compare/v4.14.0...v4.14.1) (2026-09-10)

## [4.14.0](https://github.com/theholocron/holocron/compare/v4.13.0...v4.14.0) (2026-09-10)

## [4.13.0](https://github.com/theholocron/holocron/compare/v4.12.2...v4.13.0) (2026-09-10)

## [4.12.2](https://github.com/theholocron/holocron/compare/v4.12.1...v4.12.2) (2026-09-10)

## [4.12.1](https://github.com/theholocron/holocron/compare/v4.12.0...v4.12.1) (2026-09-10)

## [4.12.0](https://github.com/theholocron/holocron/compare/v4.11.0...v4.12.0) (2026-09-10)

## [4.11.0](https://github.com/theholocron/holocron/compare/v4.10.3...v4.11.0) (2026-09-09)

## [4.10.3](https://github.com/theholocron/holocron/compare/v4.10.2...v4.10.3) (2026-09-09)

## [4.10.2](https://github.com/theholocron/holocron/compare/v4.10.1...v4.10.2) (2026-09-09)

## [4.10.1](https://github.com/theholocron/holocron/compare/v4.10.0...v4.10.1) (2026-09-09)

## [4.10.0](https://github.com/theholocron/holocron/compare/v4.9.0...v4.10.0) (2026-09-09)

## [4.9.0](https://github.com/theholocron/holocron/compare/v4.8.0...v4.9.0) (2026-09-09)

## [4.8.0](https://github.com/theholocron/holocron/compare/v4.7.0...v4.8.0) (2026-09-09)

## [4.7.0](https://github.com/theholocron/holocron/compare/v4.6.0...v4.7.0) (2026-09-09)

## [4.6.0](https://github.com/theholocron/holocron/compare/v4.5.0...v4.6.0) (2026-09-09)

## [4.5.0](https://github.com/theholocron/holocron/compare/v4.4.0...v4.5.0) (2026-09-09)

## [4.4.0](https://github.com/theholocron/holocron/compare/v4.3.0...v4.4.0) (2026-09-09)

## [4.3.0](https://github.com/theholocron/holocron/compare/v4.2.0...v4.3.0) (2026-09-09)

## [4.2.0](https://github.com/theholocron/holocron/compare/v4.1.0...v4.2.0) (2026-09-08)

## [4.1.0](https://github.com/theholocron/holocron/compare/v4.0.1...v4.1.0) (2026-09-08)

## [4.0.1](https://github.com/theholocron/holocron/compare/v4.0.0...v4.0.1) (2026-09-08)

## [4.0.0](https://github.com/theholocron/holocron/compare/v3.66.0...v4.0.0) (2026-09-08)

## [3.66.0](https://github.com/theholocron/holocron/compare/v3.65.0...v3.66.0) (2026-09-08)

## [3.65.0](https://github.com/theholocron/holocron/compare/v3.64.0...v3.65.0) (2026-09-08)

## [3.64.0](https://github.com/theholocron/holocron/compare/v3.63.0...v3.64.0) (2026-09-07)

## [3.63.0](https://github.com/theholocron/holocron/compare/v3.62.1...v3.63.0) (2026-09-07)

## [3.62.1](https://github.com/theholocron/holocron/compare/v3.62.0...v3.62.1) (2026-09-07)

## [3.62.0](https://github.com/theholocron/holocron/compare/v3.61.0...v3.62.0) (2026-09-07)

## [3.61.0](https://github.com/theholocron/holocron/compare/v3.60.0...v3.61.0) (2026-09-07)

## [3.60.0](https://github.com/theholocron/holocron/compare/v3.59.0...v3.60.0) (2026-09-07)

## [3.59.0](https://github.com/theholocron/holocron/compare/v3.58.1...v3.59.0) (2026-09-07)

## [3.58.1](https://github.com/theholocron/holocron/compare/v3.58.0...v3.58.1) (2026-09-06)

## [3.58.0](https://github.com/theholocron/holocron/compare/v3.57.0...v3.58.0) (2026-09-06)

## [3.57.0](https://github.com/theholocron/holocron/compare/v3.56.0...v3.57.0) (2026-09-06)

## [3.56.0](https://github.com/theholocron/holocron/compare/v3.55.1...v3.56.0) (2026-09-06)

## [3.55.1](https://github.com/theholocron/holocron/compare/v3.55.0...v3.55.1) (2026-09-06)

## [3.55.0](https://github.com/theholocron/holocron/compare/v3.54.0...v3.55.0) (2026-09-06)

## [3.54.0](https://github.com/theholocron/holocron/compare/v3.53.0...v3.54.0) (2026-09-06)

## [3.53.0](https://github.com/theholocron/holocron/compare/v3.52.0...v3.53.0) (2026-09-06)

## [3.52.0](https://github.com/theholocron/holocron/compare/v3.51.1...v3.52.0) (2026-09-06)

## [3.51.1](https://github.com/theholocron/holocron/compare/v3.51.0...v3.51.1) (2026-09-06)

## [3.51.0](https://github.com/theholocron/holocron/compare/v3.50.0...v3.51.0) (2026-09-06)

## [3.50.0](https://github.com/theholocron/holocron/compare/v3.49.0...v3.50.0) (2026-09-05)

## [3.49.0](https://github.com/theholocron/holocron/compare/v3.48.0...v3.49.0) (2026-09-05)

## [3.48.0](https://github.com/theholocron/holocron/compare/v3.47.1...v3.48.0) (2026-09-04)

## [3.47.1](https://github.com/theholocron/holocron/compare/v3.47.0...v3.47.1) (2026-09-03)

## [3.47.0](https://github.com/theholocron/holocron/compare/v3.46.1...v3.47.0) (2026-09-02)

## [3.46.1](https://github.com/theholocron/holocron/compare/v3.46.0...v3.46.1) (2026-09-02)

## [3.46.0](https://github.com/theholocron/holocron/compare/v3.45.5...v3.46.0) (2026-09-02)

## [3.45.5](https://github.com/theholocron/holocron/compare/v3.45.4...v3.45.5) (2026-09-01)

## [3.45.4](https://github.com/theholocron/holocron/compare/v3.45.3...v3.45.4) (2026-09-01)

## [3.45.3](https://github.com/theholocron/holocron/compare/v3.45.2...v3.45.3) (2026-09-01)

## [3.45.2](https://github.com/theholocron/holocron/compare/v3.45.1...v3.45.2) (2026-09-01)

## [3.45.1](https://github.com/theholocron/holocron/compare/v3.45.0...v3.45.1) (2026-09-01)

## [3.45.0](https://github.com/theholocron/holocron/compare/v3.44.0...v3.45.0) (2026-09-01)

## [3.44.0](https://github.com/theholocron/holocron/compare/v3.43.0...v3.44.0) (2026-09-01)

## [3.43.0](https://github.com/theholocron/holocron/compare/v3.42.0...v3.43.0) (2026-08-31)

## [3.42.0](https://github.com/theholocron/holocron/compare/v3.41.1...v3.42.0) (2026-08-31)

## [3.41.1](https://github.com/theholocron/holocron/compare/v3.41.0...v3.41.1) (2026-08-31)

## [3.41.0](https://github.com/theholocron/holocron/compare/v3.40.0...v3.41.0) (2026-08-31)

## [3.40.0](https://github.com/theholocron/holocron/compare/v3.39.0...v3.40.0) (2026-08-31)

## [3.39.0](https://github.com/theholocron/holocron/compare/v3.38.2...v3.39.0) (2026-08-31)

## [3.38.2](https://github.com/theholocron/holocron/compare/v3.38.1...v3.38.2) (2026-08-31)

## [3.38.1](https://github.com/theholocron/holocron/compare/v3.38.0...v3.38.1) (2026-08-31)

## [3.38.0](https://github.com/theholocron/holocron/compare/v3.37.2...v3.38.0) (2026-08-31)

## [3.37.2](https://github.com/theholocron/holocron/compare/v3.37.1...v3.37.2) (2026-08-30)

## [3.37.1](https://github.com/theholocron/holocron/compare/v3.37.0...v3.37.1) (2026-08-30)

## [3.37.0](https://github.com/theholocron/holocron/compare/v3.36.0...v3.37.0) (2026-08-30)

## [3.36.0](https://github.com/theholocron/holocron/compare/v3.35.0...v3.36.0) (2026-08-28)

## [3.35.0](https://github.com/theholocron/holocron/compare/v3.34.6...v3.35.0) (2026-08-28)

## [3.34.6](https://github.com/theholocron/holocron/compare/v3.34.5...v3.34.6) (2026-08-28)

## [3.34.5](https://github.com/theholocron/holocron/compare/v3.34.4...v3.34.5) (2026-08-27)

## [3.34.4](https://github.com/theholocron/holocron/compare/v3.34.3...v3.34.4) (2026-08-27)

## [3.34.3](https://github.com/theholocron/holocron/compare/v3.34.2...v3.34.3) (2026-08-27)

## [3.34.2](https://github.com/theholocron/holocron/compare/v3.34.1...v3.34.2) (2026-08-27)

## [3.34.1](https://github.com/theholocron/holocron/compare/v3.34.0...v3.34.1) (2026-08-27)

## [3.34.0](https://github.com/theholocron/holocron/compare/v3.33.4...v3.34.0) (2026-08-27)

## [3.33.4](https://github.com/theholocron/holocron/compare/v3.33.3...v3.33.4) (2026-08-27)

## [3.33.3](https://github.com/theholocron/holocron/compare/v3.33.2...v3.33.3) (2026-08-27)

## [3.33.2](https://github.com/theholocron/holocron/compare/v3.33.1...v3.33.2) (2026-08-27)

## [3.33.1](https://github.com/theholocron/holocron/compare/v3.33.0...v3.33.1) (2026-08-27)

## [3.33.0](https://github.com/theholocron/holocron/compare/v3.32.0...v3.33.0) (2026-08-27)

## [3.32.0](https://github.com/theholocron/holocron/compare/v3.31.1...v3.32.0) (2026-08-27)

## [3.31.1](https://github.com/theholocron/holocron/compare/v3.31.0...v3.31.1) (2026-08-27)

## [3.31.0](https://github.com/theholocron/holocron/compare/v3.30.6...v3.31.0) (2026-08-27)

## [3.30.6](https://github.com/theholocron/holocron/compare/v3.30.5...v3.30.6) (2026-08-26)

## [3.30.5](https://github.com/theholocron/holocron/compare/v3.30.4...v3.30.5) (2026-08-26)

## [3.30.4](https://github.com/theholocron/holocron/compare/v3.30.3...v3.30.4) (2026-08-26)

## [3.30.3](https://github.com/theholocron/holocron/compare/v3.30.2...v3.30.3) (2026-08-26)

## [3.30.2](https://github.com/theholocron/holocron/compare/v3.30.1...v3.30.2) (2026-08-26)

## [3.30.1](https://github.com/theholocron/holocron/compare/v3.30.0...v3.30.1) (2026-08-26)

## [3.30.0](https://github.com/theholocron/holocron/compare/v3.29.12...v3.30.0) (2026-08-26)

## [3.29.12](https://github.com/theholocron/holocron/compare/v3.29.11...v3.29.12) (2026-08-21)

## [3.29.11](https://github.com/theholocron/holocron/compare/v3.29.10...v3.29.11) (2026-08-20)

## [3.29.10](https://github.com/theholocron/holocron/compare/v3.29.9...v3.29.10) (2026-08-20)

## [3.29.9](https://github.com/theholocron/holocron/compare/v3.29.8...v3.29.9) (2026-08-20)

## [3.29.8](https://github.com/theholocron/holocron/compare/v3.29.7...v3.29.8) (2026-08-20)

## [3.29.7](https://github.com/theholocron/holocron/compare/v3.29.6...v3.29.7) (2026-08-20)

## [3.29.6](https://github.com/theholocron/holocron/compare/v3.29.5...v3.29.6) (2026-08-20)

## [3.29.5](https://github.com/theholocron/holocron/compare/v3.29.4...v3.29.5) (2026-08-20)

## [3.29.4](https://github.com/theholocron/holocron/compare/v3.29.3...v3.29.4) (2026-08-19)

## [3.29.3](https://github.com/theholocron/holocron/compare/v3.29.2...v3.29.3) (2026-08-19)

## [3.29.2](https://github.com/theholocron/holocron/compare/v3.29.1...v3.29.2) (2026-08-18)

## [3.29.1](https://github.com/theholocron/holocron/compare/v3.29.0...v3.29.1) (2026-08-18)

## [3.29.0](https://github.com/theholocron/holocron/compare/v3.28.1...v3.29.0) (2026-08-18)

## [3.28.1](https://github.com/theholocron/holocron/compare/v3.28.0...v3.28.1) (2026-08-18)

## [3.28.0](https://github.com/theholocron/holocron/compare/v3.27.0...v3.28.0) (2026-08-18)

## [3.27.0](https://github.com/theholocron/holocron/compare/v3.26.0...v3.27.0) (2026-08-18)

## [3.26.0](https://github.com/theholocron/holocron/compare/v3.25.1...v3.26.0) (2026-08-18)

## [3.25.1](https://github.com/theholocron/holocron/compare/v3.25.0...v3.25.1) (2026-08-17)

## [3.25.0](https://github.com/theholocron/holocron/compare/v3.24.4...v3.25.0) (2026-08-17)

## [3.24.4](https://github.com/theholocron/holocron/compare/v3.24.3...v3.24.4) (2026-08-15)

## [3.24.3](https://github.com/theholocron/holocron/compare/v3.24.2...v3.24.3) (2026-08-13)

## [3.24.2](https://github.com/theholocron/holocron/compare/v3.24.1...v3.24.2) (2026-08-13)

## [3.24.1](https://github.com/theholocron/holocron/compare/v3.24.0...v3.24.1) (2026-08-13)

## [3.24.0](https://github.com/theholocron/holocron/compare/v3.23.0...v3.24.0) (2026-08-13)

## [3.23.0](https://github.com/theholocron/holocron/compare/v3.22.1...v3.23.0) (2026-08-13)

## [3.22.1](https://github.com/theholocron/holocron/compare/v3.22.0...v3.22.1) (2026-08-13)

## [3.22.0](https://github.com/theholocron/holocron/compare/v3.21.0...v3.22.0) (2026-08-13)

## [3.21.0](https://github.com/theholocron/holocron/compare/v3.20.0...v3.21.0) (2026-08-13)

## [3.20.0](https://github.com/theholocron/holocron/compare/v3.19.2...v3.20.0) (2026-08-12)

## [3.19.2](https://github.com/theholocron/holocron/compare/v3.19.1...v3.19.2) (2026-08-12)

## [3.19.1](https://github.com/theholocron/holocron/compare/v3.19.0...v3.19.1) (2026-08-11)

## [3.19.0](https://github.com/theholocron/holocron/compare/v3.18.8...v3.19.0) (2026-08-11)

## [3.18.8](https://github.com/theholocron/holocron/compare/v3.18.7...v3.18.8) (2026-08-11)

## [3.18.7](https://github.com/theholocron/holocron/compare/v3.18.6...v3.18.7) (2026-08-11)

## [3.18.6](https://github.com/theholocron/holocron/compare/v3.18.5...v3.18.6) (2026-08-11)

## [3.18.5](https://github.com/theholocron/holocron/compare/v3.18.4...v3.18.5) (2026-08-11)

## [3.18.4](https://github.com/theholocron/holocron/compare/v3.18.3...v3.18.4) (2026-08-11)

## [3.18.3](https://github.com/theholocron/holocron/compare/v3.18.2...v3.18.3) (2026-08-11)

## [3.18.2](https://github.com/theholocron/holocron/compare/v3.18.1...v3.18.2) (2026-08-11)

## [3.18.1](https://github.com/theholocron/holocron/compare/v3.18.0...v3.18.1) (2026-08-10)

## [3.18.0](https://github.com/theholocron/holocron/compare/v3.17.2...v3.18.0) (2026-08-10)

## [3.17.2](https://github.com/theholocron/holocron/compare/v3.17.1...v3.17.2) (2026-08-10)

## [3.17.1](https://github.com/theholocron/holocron/compare/v3.17.0...v3.17.1) (2026-08-09)

## [3.17.0](https://github.com/theholocron/holocron/compare/v3.16.1...v3.17.0) (2026-08-07)

## [3.16.1](https://github.com/theholocron/holocron/compare/v3.16.0...v3.16.1) (2026-08-07)

## [3.16.0](https://github.com/theholocron/holocron/compare/v3.15.0...v3.16.0) (2026-08-07)

## [3.15.0](https://github.com/theholocron/holocron/compare/v3.14.0...v3.15.0) (2026-08-07)

## [3.14.0](https://github.com/theholocron/holocron/compare/v3.13.1...v3.14.0) (2026-08-07)

## [3.13.1](https://github.com/theholocron/holocron/compare/v3.13.0...v3.13.1) (2026-08-07)

## [3.13.0](https://github.com/theholocron/holocron/compare/v3.12.3...v3.13.0) (2026-08-06)

## [3.12.3](https://github.com/theholocron/holocron/compare/v3.12.2...v3.12.3) (2026-08-06)

## [3.12.2](https://github.com/theholocron/holocron/compare/v3.12.1...v3.12.2) (2026-08-06)

## [3.12.1](https://github.com/theholocron/holocron/compare/v3.12.0...v3.12.1) (2026-08-06)

## [3.12.0](https://github.com/theholocron/holocron/compare/v3.11.0...v3.12.0) (2026-08-05)

## [3.11.0](https://github.com/theholocron/holocron/compare/v3.10.0...v3.11.0) (2026-08-05)

## [3.10.0](https://github.com/theholocron/holocron/compare/v3.9.6...v3.10.0) (2026-08-05)

## [3.9.6](https://github.com/theholocron/holocron/compare/v3.9.5...v3.9.6) (2026-08-05)

## [3.9.5](https://github.com/theholocron/holocron/compare/v3.9.4...v3.9.5) (2026-08-05)

## [3.9.4](https://github.com/theholocron/holocron/compare/v3.9.3...v3.9.4) (2026-08-05)

## [3.9.3](https://github.com/theholocron/holocron/compare/v3.9.2...v3.9.3) (2026-08-05)

## [3.9.2](https://github.com/theholocron/holocron/compare/v3.9.1...v3.9.2) (2026-08-04)

## [3.9.1](https://github.com/theholocron/holocron/compare/v3.9.0...v3.9.1) (2026-08-04)

## [3.9.0](https://github.com/theholocron/holocron/compare/v3.8.3...v3.9.0) (2026-08-04)

## [3.8.3](https://github.com/theholocron/holocron/compare/v3.8.2...v3.8.3) (2026-08-04)

## [3.8.2](https://github.com/theholocron/holocron/compare/v3.8.1...v3.8.2) (2026-08-04)

## [3.8.1](https://github.com/theholocron/holocron/compare/v3.8.0...v3.8.1) (2026-08-03)

## [3.8.0](https://github.com/theholocron/holocron/compare/v3.7.1...v3.8.0) (2026-08-03)

## [3.7.1](https://github.com/theholocron/holocron/compare/v3.7.0...v3.7.1) (2026-08-03)

## [3.7.0](https://github.com/theholocron/holocron/compare/v3.6.0...v3.7.0) (2026-08-03)

## [3.6.0](https://github.com/theholocron/holocron/compare/v3.5.4...v3.6.0) (2026-08-02)

## [3.5.4](https://github.com/theholocron/holocron/compare/v3.5.3...v3.5.4) (2026-08-02)

## [3.5.3](https://github.com/theholocron/holocron/compare/v3.5.2...v3.5.3) (2026-08-02)

## [3.5.2](https://github.com/theholocron/holocron/compare/v3.5.1...v3.5.2) (2026-08-01)

## [3.5.1](https://github.com/theholocron/holocron/compare/v3.5.0...v3.5.1) (2026-07-31)

## [3.5.0](https://github.com/theholocron/holocron/compare/v3.4.0...v3.5.0) (2026-07-31)

## [3.4.0](https://github.com/theholocron/holocron/compare/v3.3.15...v3.4.0) (2026-07-30)

## [3.3.15](https://github.com/theholocron/holocron/compare/v3.3.14...v3.3.15) (2026-07-30)

## [3.3.14](https://github.com/theholocron/holocron/compare/v3.3.13...v3.3.14) (2026-07-29)

## [3.3.13](https://github.com/theholocron/holocron/compare/v3.3.12...v3.3.13) (2026-07-29)

## [3.3.12](https://github.com/theholocron/holocron/compare/v3.3.11...v3.3.12) (2026-07-29)

## [3.3.11](https://github.com/theholocron/holocron/compare/v3.3.10...v3.3.11) (2026-07-29)

## [3.3.10](https://github.com/theholocron/holocron/compare/v3.3.9...v3.3.10) (2026-07-29)

## [3.3.9](https://github.com/theholocron/holocron/compare/v3.3.8...v3.3.9) (2026-07-29)

## [3.3.8](https://github.com/theholocron/holocron/compare/v3.3.7...v3.3.8) (2026-07-29)

## [3.3.7](https://github.com/theholocron/holocron/compare/v3.3.6...v3.3.7) (2026-07-29)

## [3.3.6](https://github.com/theholocron/holocron/compare/v3.3.5...v3.3.6) (2026-07-29)

## [3.3.5](https://github.com/theholocron/holocron/compare/v3.3.4...v3.3.5) (2026-07-29)

## [3.3.4](https://github.com/theholocron/holocron/compare/v3.3.3...v3.3.4) (2026-07-29)

## [3.3.3](https://github.com/theholocron/holocron/compare/v3.3.2...v3.3.3) (2026-07-28)

## [3.3.2](https://github.com/theholocron/holocron/compare/v3.3.1...v3.3.2) (2026-07-28)

## [3.3.1](https://github.com/theholocron/holocron/compare/v3.3.0...v3.3.1) (2026-07-28)

## [3.3.0](https://github.com/theholocron/holocron/compare/v3.2.0...v3.3.0) (2026-07-28)

## [3.2.0](https://github.com/theholocron/holocron/compare/v3.1.1...v3.2.0) (2026-07-28)

## [3.1.1](https://github.com/theholocron/holocron/compare/v3.1.0...v3.1.1) (2026-07-28)

## [3.1.0](https://github.com/theholocron/holocron/compare/v3.0.2...v3.1.0) (2026-07-28)

## [3.0.2](https://github.com/theholocron/holocron/compare/v3.0.1...v3.0.2) (2026-07-27)

## [3.0.1](https://github.com/theholocron/holocron/compare/v3.0.0...v3.0.1) (2026-07-27)

## [3.0.0](https://github.com/theholocron/holocron/compare/v2.2.3...v3.0.0) (2026-07-27)

## [2.2.4](https://github.com/theholocron/holocron/compare/v2.2.3...v2.2.4) (2026-07-23)

## [2.2.3](https://github.com/theholocron/holocron/compare/v2.2.2...v2.2.3) (2026-07-23)

## [2.2.2](https://github.com/theholocron/holocron/compare/v2.2.1...v2.2.2) (2026-07-23)

## [2.2.1](https://github.com/theholocron/holocron/compare/v2.2.0...v2.2.1) (2026-07-22)

## [2.2.0](https://github.com/theholocron/holocron/compare/v2.1.1...v2.2.0) (2026-07-22)

## [2.1.1](https://github.com/theholocron/holocron/compare/v2.1.0...v2.1.1) (2026-07-22)

## [2.1.0](https://github.com/theholocron/holocron/compare/v2.0.2...v2.1.0) (2026-07-22)

## [2.0.2](https://github.com/theholocron/holocron/compare/v2.0.1...v2.0.2) (2026-07-22)

## [2.0.1](https://github.com/theholocron/holocron/compare/v2.0.0...v2.0.1) (2026-07-22)

## [2.0.0](https://github.com/theholocron/holocron/compare/v1.0.0...v2.0.0) (2026-07-22)

## [2.0.0-alpha.77](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.76...v2.0.0-alpha.77) (2026-07-22)

## [2.0.0-alpha.76](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.75...v2.0.0-alpha.76) (2026-07-22)

## [2.0.0-alpha.75](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.74...v2.0.0-alpha.75) (2026-07-22)

## [2.0.0-alpha.74](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.73...v2.0.0-alpha.74) (2026-07-22)

## [2.0.0-alpha.73](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.72...v2.0.0-alpha.73) (2026-07-22)

## [2.0.0-alpha.72](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.71...v2.0.0-alpha.72) (2026-07-21)

## [2.0.0-alpha.71](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.70...v2.0.0-alpha.71) (2026-07-21)

## [2.0.0-alpha.70](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.69...v2.0.0-alpha.70) (2026-07-21)

## [2.0.0-alpha.69](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.68...v2.0.0-alpha.69) (2026-07-21)

## [2.0.0-alpha.68](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.67...v2.0.0-alpha.68) (2026-07-21)

## [2.0.0-alpha.67](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.66...v2.0.0-alpha.67) (2026-07-21)

## [2.0.0-alpha.66](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.65...v2.0.0-alpha.66) (2026-07-20)

## [2.0.0-alpha.65](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.64...v2.0.0-alpha.65) (2026-07-20)

## [2.0.0-alpha.64](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.63...v2.0.0-alpha.64) (2026-07-20)

## [2.0.0-alpha.63](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.62...v2.0.0-alpha.63) (2026-07-20)

## [2.0.0-alpha.62](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.61...v2.0.0-alpha.62) (2026-07-20)

## [2.0.0-alpha.61](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.60...v2.0.0-alpha.61) (2026-07-20)

## [2.0.0-alpha.60](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.59...v2.0.0-alpha.60) (2026-07-20)

## [2.0.0-alpha.59](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.58...v2.0.0-alpha.59) (2026-07-20)

## [2.0.0-alpha.58](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.57...v2.0.0-alpha.58) (2026-07-20)

## [2.0.0-alpha.57](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.56...v2.0.0-alpha.57) (2026-07-20)

## [2.0.0-alpha.56](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.55...v2.0.0-alpha.56) (2026-07-20)

## [2.0.0-alpha.55](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.54...v2.0.0-alpha.55) (2026-07-20)

## [2.0.0-alpha.54](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.53...v2.0.0-alpha.54) (2026-07-18)

## [2.0.0-alpha.53](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.52...v2.0.0-alpha.53) (2026-07-18)

## [2.0.0-alpha.52](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.51...v2.0.0-alpha.52) (2026-07-18)

## [2.0.0-alpha.51](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.50...v2.0.0-alpha.51) (2026-07-18)

## [2.0.0-alpha.50](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.49...v2.0.0-alpha.50) (2026-07-17)

## [2.0.0-alpha.49](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.48...v2.0.0-alpha.49) (2026-07-17)

## [2.0.0-alpha.48](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.47...v2.0.0-alpha.48) (2026-07-17)

## [2.0.0-alpha.47](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.46...v2.0.0-alpha.47) (2026-07-17)

## [2.0.0-alpha.46](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.45...v2.0.0-alpha.46) (2026-07-16)

## [2.0.0-alpha.45](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.44...v2.0.0-alpha.45) (2026-07-16)

## [2.0.0-alpha.44](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.43...v2.0.0-alpha.44) (2026-07-16)

## [2.0.0-alpha.43](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.42...v2.0.0-alpha.43) (2026-07-15)

## [2.0.0-alpha.42](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.41...v2.0.0-alpha.42) (2026-07-15)

## [2.0.0-alpha.41](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.40...v2.0.0-alpha.41) (2026-07-15)

## [2.0.0-alpha.40](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.39...v2.0.0-alpha.40) (2026-07-15)

## [2.0.0-alpha.39](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.38...v2.0.0-alpha.39) (2026-07-15)

## [2.0.0-alpha.38](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.37...v2.0.0-alpha.38) (2026-07-15)

## [2.0.0-alpha.37](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.36...v2.0.0-alpha.37) (2026-07-15)

## [2.0.0-alpha.36](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.35...v2.0.0-alpha.36) (2026-07-15)

## [2.0.0-alpha.35](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.34...v2.0.0-alpha.35) (2026-07-14)

## [2.0.0-alpha.34](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.33...v2.0.0-alpha.34) (2026-07-14)

## [2.0.0-alpha.33](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.32...v2.0.0-alpha.33) (2026-07-14)

## [2.0.0-alpha.32](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.31...v2.0.0-alpha.32) (2026-07-14)

## [2.0.0-alpha.31](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.30...v2.0.0-alpha.31) (2026-07-14)

## [2.0.0-alpha.30](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.29...v2.0.0-alpha.30) (2026-07-14)

## [2.0.0-alpha.29](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.28...v2.0.0-alpha.29) (2026-07-14)

## [2.0.0-alpha.28](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.27...v2.0.0-alpha.28) (2026-07-14)

## [2.0.0-alpha.27](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.26...v2.0.0-alpha.27) (2026-07-14)

## [2.0.0-alpha.26](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.25...v2.0.0-alpha.26) (2026-07-14)

## [2.0.0-alpha.25](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.24...v2.0.0-alpha.25) (2026-07-14)

## [2.0.0-alpha.24](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.23...v2.0.0-alpha.24) (2026-07-14)

## [2.0.0-alpha.23](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.22...v2.0.0-alpha.23) (2026-07-14)

## [2.0.0-alpha.22](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.21...v2.0.0-alpha.22) (2026-07-13)

## [2.0.0-alpha.21](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.20...v2.0.0-alpha.21) (2026-07-13)

## [2.0.0-alpha.20](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.19...v2.0.0-alpha.20) (2026-07-11)

## [2.0.0-alpha.19](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.18...v2.0.0-alpha.19) (2026-07-11)

## [2.0.0-alpha.18](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.17...v2.0.0-alpha.18) (2026-07-11)

## [2.0.0-alpha.17](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.16...v2.0.0-alpha.17) (2026-07-11)

## [2.0.0-alpha.16](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.15...v2.0.0-alpha.16) (2026-07-11)

## [2.0.0-alpha.15](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.14...v2.0.0-alpha.15) (2026-07-11)

## [2.0.0-alpha.14](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.13...v2.0.0-alpha.14) (2026-07-11)

## [2.0.0-alpha.13](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.12...v2.0.0-alpha.13) (2026-07-11)

## [2.0.0-alpha.12](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.11...v2.0.0-alpha.12) (2026-07-11)

## [2.0.0-alpha.11](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.10...v2.0.0-alpha.11) (2026-07-11)

## [2.0.0-alpha.10](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.9...v2.0.0-alpha.10) (2026-07-10)

## [2.0.0-alpha.9](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.8...v2.0.0-alpha.9) (2026-07-09)

## [2.0.0-alpha.8](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.7...v2.0.0-alpha.8) (2026-07-09)

## [2.0.0-alpha.7](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.6...v2.0.0-alpha.7) (2026-07-09)

## [2.0.0-alpha.6](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.5...v2.0.0-alpha.6) (2026-07-09)

## [2.0.0-alpha.5](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.4...v2.0.0-alpha.5) (2026-07-09)

## [2.0.0-alpha.4](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.3...v2.0.0-alpha.4) (2026-07-09)

## [2.0.0-alpha.3](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.2...v2.0.0-alpha.3) (2026-07-09)

## [2.0.0-alpha.2](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2026-07-09)

## [2.0.0-alpha.1](https://github.com/theholocron/holocron/compare/v2.0.0-alpha.0...v2.0.0-alpha.1) (2026-07-01)

# Changelog

## 1.0.0 (2024-10-31)

### Features

- create `bootstrap` command to update template variables ([#5](https://github.com/theholocron/holocron/issues/5)) ([cf85fc5](https://github.com/theholocron/holocron/commit/cf85fc5989cee4c46c6a0b3f6ff9777441f4bb14))
