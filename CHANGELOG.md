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
