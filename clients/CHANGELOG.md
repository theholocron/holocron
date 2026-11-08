## [1.58.0-alpha.20](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.19...clients-v1.58.0-alpha.20) (2026-11-08)

### Features

* **linear:** apply and compare git automation rules, validate issue templates ([#1930](https://github.com/theholocron/holocron/issues/1930)) ([becf6ed](https://github.com/theholocron/holocron/commit/becf6ed6bd9561714f6e9c46dd4fc50c3126c871)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)

## [1.58.0-alpha.19](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.18...clients-v1.58.0-alpha.19) (2026-11-08)

### Bug Fixes

* **plugins:** 🔇 hide link previews in the pull-request feed forum ([#1926](https://github.com/theholocron/holocron/issues/1926)) ([b417ab4](https://github.com/theholocron/holocron/commit/b417ab4c407f6dc995f6f1e052d17aabc35b7e7c)), closes [#1738](https://github.com/theholocron/holocron/issues/1738)

## [1.58.0-alpha.18](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.17...clients-v1.58.0-alpha.18) (2026-11-08)

### Features

* **env:** 🏷️ read the Holocron-owned variables as HOLOCRON_<NAME> first ([#1911](https://github.com/theholocron/holocron/issues/1911)) ([683311c](https://github.com/theholocron/holocron/commit/683311cb5e9b59dc8821b9b9a43fa1bef32a1c32)), closes [#1864](https://github.com/theholocron/holocron/issues/1864) [#1727](https://github.com/theholocron/holocron/issues/1727)

## [1.58.0-alpha.17](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.16...clients-v1.58.0-alpha.17) (2026-11-07)

### Features

* **cli:** ✨ add holocron provider and Linear setup and doctor ([#1916](https://github.com/theholocron/holocron/issues/1916)) ([2005e2f](https://github.com/theholocron/holocron/commit/2005e2f5e65bd99a4759a188632b914958529350)), closes [#1859](https://github.com/theholocron/holocron/issues/1859)
* **plugins:** ✨ add a Linear plugin and `holocron migrate` between trackers ([#1857](https://github.com/theholocron/holocron/issues/1857)) ([9996268](https://github.com/theholocron/holocron/commit/9996268d92a5cb2b05bc3432f524ebef49088e79)), closes [#1856](https://github.com/theholocron/holocron/issues/1856) [#1856](https://github.com/theholocron/holocron/issues/1856)

## [1.58.0-alpha.16](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.15...clients-v1.58.0-alpha.16) (2026-11-07)

### Features

* **sentinel:** ✨ [#prs](https://github.com/theholocron/holocron/issues/prs) post titled repo#N: title, with the description and no Sourcery ([#1918](https://github.com/theholocron/holocron/issues/1918)) ([8c8b1a6](https://github.com/theholocron/holocron/commit/8c8b1a66f7ee688a0d9c3777437deacb1f957a46))

## [1.58.0-alpha.15](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.14...clients-v1.58.0-alpha.15) (2026-11-07)

### Features

* **repo:** ✨ doctor flags capabilities the org property lacks, `repo properties apply` adds them ([#1873](https://github.com/theholocron/holocron/issues/1873)) ([d359f55](https://github.com/theholocron/holocron/commit/d359f559709b32544bccb28a8d832e555f066f7e)), closes [#1862](https://github.com/theholocron/holocron/issues/1862) [#1862](https://github.com/theholocron/holocron/issues/1862)

### Chores

* **env:** 🔒 read env through env-utils lookup, enable noProcessEnv ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1872](https://github.com/theholocron/holocron/issues/1872)) ([25ba866](https://github.com/theholocron/holocron/commit/25ba8667d1054686edb17ce3ceea0c82f8236ac7))

## [1.58.0-alpha.14](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.13...clients-v1.58.0-alpha.14) (2026-11-07)

### Features

* **doctor:** 🩺 holocron doctor github-app checks an App against its manifest ([#1854](https://github.com/theholocron/holocron/issues/1854)) ([81247cf](https://github.com/theholocron/holocron/commit/81247cf307d27d0f9c780a009b155a934de88fc7)), closes [#1851](https://github.com/theholocron/holocron/issues/1851) [#1851](https://github.com/theholocron/holocron/issues/1851)

## [1.58.0-alpha.13](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.12...clients-v1.58.0-alpha.13) (2026-11-07)

### Features

* **notifications:** 🧵 append, edit and de-duplicate posts in a forum thread ([#1841](https://github.com/theholocron/holocron/issues/1841)) ([750baaa](https://github.com/theholocron/holocron/commit/750baaa1fbf29a240a97d65f71a91fae3d2034a6)), closes [#1832](https://github.com/theholocron/holocron/issues/1832)
* **sentinel:** 📡 post a thread per pull request to the [#prs](https://github.com/theholocron/holocron/issues/prs) forum ([#1843](https://github.com/theholocron/holocron/issues/1843)) ([1b7a51e](https://github.com/theholocron/holocron/commit/1b7a51e4ba396e6d4778c867a715c77adf696cdb)), closes [#1833](https://github.com/theholocron/holocron/issues/1833)

### Documentation

* **github-client:** 📝 document the GraphQL client's exports ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1837](https://github.com/theholocron/holocron/issues/1837)) ([1e92d66](https://github.com/theholocron/holocron/commit/1e92d66c0843c5f825cababdcc664e58a77198fd))

## [1.58.0-alpha.12](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.11...clients-v1.58.0-alpha.12) (2026-11-06)

### Features

* **notifications:** ✨ default and starter reactions for forum channels ([#1825](https://github.com/theholocron/holocron/issues/1825)) ([e0571e3](https://github.com/theholocron/holocron/commit/e0571e30502c1dddf58d105771bca68496a67bd7)), closes [#1822](https://github.com/theholocron/holocron/issues/1822)

## [1.58.0-alpha.11](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.10...clients-v1.58.0-alpha.11) (2026-11-06)

### Features

* **github-client:** 📁 list a directory through the Contents API ([#1797](https://github.com/theholocron/holocron/issues/1797)) ([c85f34e](https://github.com/theholocron/holocron/commit/c85f34e8c5760db948c75f595fffaad959a68f7e)), closes [#1784](https://github.com/theholocron/holocron/issues/1784) [#1784](https://github.com/theholocron/holocron/issues/1784) [#1784](https://github.com/theholocron/holocron/issues/1784)

## [1.58.0-alpha.10](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.9...clients-v1.58.0-alpha.10) (2026-11-06)

### Refactoring

* **http-client:** ♻️ remove deprecated token resolver, now in kyber/secrets ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1780](https://github.com/theholocron/holocron/issues/1780)) ([19896c3](https://github.com/theholocron/holocron/commit/19896c3e0642c6acc6202804e4d12aefd3e3094e))

## [1.58.0-alpha.9](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.8...clients-v1.58.0-alpha.9) (2026-11-06)

### Features

* **cli:** 🌿 add the token resolver to kyber's /secrets and deprecate http-client's copy ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1762](https://github.com/theholocron/holocron/issues/1762)) ([711d9cd](https://github.com/theholocron/holocron/commit/711d9cd3979f9d28b01f48de0b5c08e6d2caec7e))

### Refactoring

* **cli:** 🧹 build the token resolvers on kyber's instead of http-client's ([#1727](https://github.com/theholocron/holocron/issues/1727)) ([#1763](https://github.com/theholocron/holocron/issues/1763)) ([22591ff](https://github.com/theholocron/holocron/commit/22591ff9ca7a155b823812dd2ab85599a82c6d2b))

## [1.58.0-alpha.8](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.7...clients-v1.58.0-alpha.8) (2026-11-05)

### Features

* **github:** add the projects capability for Projects v2 boards ([#1755](https://github.com/theholocron/holocron/issues/1755)) ([6f05088](https://github.com/theholocron/holocron/commit/6f050883778798347f911657c4a75ac62a1c3a67)), closes [#1744](https://github.com/theholocron/holocron/issues/1744) [#1744](https://github.com/theholocron/holocron/issues/1744)

## [1.58.0-alpha.7](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.6...clients-v1.58.0-alpha.7) (2026-11-03)

### Refactoring

* **repo:** ♻️ rename scripts and tasks across this monorepo to the flat ids ([#1646](https://github.com/theholocron/holocron/issues/1646)) ([62f97fe](https://github.com/theholocron/holocron/commit/62f97feec78ebf614e18ffff53eebaa030cfd220)), closes [#1617](https://github.com/theholocron/holocron/issues/1617) [#1617](https://github.com/theholocron/holocron/issues/1617)

### Documentation

* 📝 clear the alex inclusive-language hits across the markdown ([#1559](https://github.com/theholocron/holocron/issues/1559)) ([573580e](https://github.com/theholocron/holocron/commit/573580ee02d288ce5184d69ee8cc09acbdb95042)), closes [#1263](https://github.com/theholocron/holocron/issues/1263) [#868](https://github.com/theholocron/holocron/issues/868) [#1311](https://github.com/theholocron/holocron/issues/1311) [#1354](https://github.com/theholocron/holocron/issues/1354)

## [1.58.0-alpha.6](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.5...clients-v1.58.0-alpha.6) (2026-11-02)

### Features

* **docs:** 📚 measure every package export, not only the root ([#1531](https://github.com/theholocron/holocron/issues/1531)) ([#1555](https://github.com/theholocron/holocron/issues/1555)) ([ac983a2](https://github.com/theholocron/holocron/commit/ac983a26faaacba3bb8980dd8c98c8677c5ab649))

## [1.58.0-alpha.5](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.4...clients-v1.58.0-alpha.5) (2026-11-02)

### Features

* **discord-client:** 🧵 add forum posts and threads to the bot client ([#1539](https://github.com/theholocron/holocron/issues/1539)) ([cbd4e0b](https://github.com/theholocron/holocron/commit/cbd4e0bb6c14a44fcc5c0a0ae6f7ed4dba594754)), closes [#1535](https://github.com/theholocron/holocron/issues/1535)

## [1.58.0-alpha.4](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.3...clients-v1.58.0-alpha.4) (2026-11-01)

### Refactoring

* **sentinel:** ♻️ run the docs-presence check on the shared rules ([#1526](https://github.com/theholocron/holocron/issues/1526)) ([c2d8cec](https://github.com/theholocron/holocron/commit/c2d8cece9c79b8519749ddc5e9b98770d15929e5)), closes [#929](https://github.com/theholocron/holocron/issues/929)

### Documentation

* **clients:** 📝 document the checkly, postman and netlify clients with TSDoc ([#1490](https://github.com/theholocron/holocron/issues/1490)) ([939d4b4](https://github.com/theholocron/holocron/commit/939d4b448420e7c2e35d83b7981e392522c3749f))
* **clients:** 📝 document the clerk and cloudflare clients with TSDoc ([#1496](https://github.com/theholocron/holocron/issues/1496)) ([596c41a](https://github.com/theholocron/holocron/commit/596c41a0dcedf972a6b20f7037b654054d7cbb9d))
* **clients:** 📝 document the remaining clients with TSDoc ([#1503](https://github.com/theholocron/holocron/issues/1503)) ([a5fb573](https://github.com/theholocron/holocron/commit/a5fb57357f65e76f200943205e4c593f74be4bbf))
* **clients:** 📝 document the vercel, sentry and jira clients with TSDoc ([#1502](https://github.com/theholocron/holocron/issues/1502)) ([6555e53](https://github.com/theholocron/holocron/commit/6555e53b07325fc9d307bb0fe44369ff9d6bf5e5))
* **clients:** 📝 trim the client pages the generated reference duplicates ([#1520](https://github.com/theholocron/holocron/issues/1520)) ([5645029](https://github.com/theholocron/holocron/commit/56450296a9ae723f71a2e447e0a987b9b417af48)), closes [#1512](https://github.com/theholocron/holocron/issues/1512)
* **discord-client:** 📝 document the public API with TSDoc ([#1494](https://github.com/theholocron/holocron/issues/1494)) ([f668053](https://github.com/theholocron/holocron/commit/f668053448e20a8745889d6de45033cb1c260f0c))
* **github-client:** 📝 document the public API with TSDoc ([#1501](https://github.com/theholocron/holocron/issues/1501)) ([fae3b9f](https://github.com/theholocron/holocron/commit/fae3b9fabc0e7dabf5009a67ccde960e4083c72b))
* **zendesk-client:** 📝 document the public API with TSDoc ([#1491](https://github.com/theholocron/holocron/issues/1491)) ([e5f70a2](https://github.com/theholocron/holocron/commit/e5f70a2c60909ee54873922faaa61f39589d2566))

## [1.58.0-alpha.3](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.2...clients-v1.58.0-alpha.3) (2026-10-31)

### Features

* **cli:** 🩺 doctor repo — check the repository settings match the config ([#1456](https://github.com/theholocron/holocron/issues/1456)) ([c157fbb](https://github.com/theholocron/holocron/commit/c157fbb34483e63bbd5fcfdf677f1c84fbeeaaf4)), closes [#1454](https://github.com/theholocron/holocron/issues/1454) [#1162](https://github.com/theholocron/holocron/issues/1162)

## [1.58.0-alpha.2](https://github.com/theholocron/holocron/compare/clients-v1.58.0-alpha.1...clients-v1.58.0-alpha.2) (2026-10-31)

### Features

* **cli:** ⏰ doctor tokens warns a week before a token expires ([#1449](https://github.com/theholocron/holocron/issues/1449)) ([8069eab](https://github.com/theholocron/holocron/commit/8069eab96c5a015440750d569965f1629f99008d))

## [1.58.0-alpha.1](https://github.com/theholocron/holocron/compare/clients-v1.57.1-alpha.2...clients-v1.58.0-alpha.1) (2026-10-31)

### Features

* **cli:** ✨ holocron repo cleanup branches ([#1426](https://github.com/theholocron/holocron/issues/1426)) ([5e0d57f](https://github.com/theholocron/holocron/commit/5e0d57f4f200d303446adab6170b080bb87710ee)), closes [#1417](https://github.com/theholocron/holocron/issues/1417)

### Documentation

* 📝 carry the per-repo agent rules into the monorepo groups ([#1425](https://github.com/theholocron/holocron/issues/1425)) ([77f60e1](https://github.com/theholocron/holocron/commit/77f60e19f321a76dddc23d4840a25855e2729fce)), closes [#1394](https://github.com/theholocron/holocron/issues/1394) [#1394](https://github.com/theholocron/holocron/issues/1394)

## [1.57.1-alpha.2](https://github.com/theholocron/holocron/compare/clients-v1.57.1-alpha.1...clients-v1.57.1-alpha.2) (2026-10-30)

### Bug Fixes

* **cloudflare:** 🐛 retry a read that gets a transient 5xx so repo setup does not fail on one ([#1414](https://github.com/theholocron/holocron/issues/1414)) ([55123d5](https://github.com/theholocron/holocron/commit/55123d5facaa1258883c01aa39c92c9305a64797)), closes [#1398](https://github.com/theholocron/holocron/issues/1398) [#1398](https://github.com/theholocron/holocron/issues/1398)
* **github:** 🐛 say which custom property value GitHub refused on a 422 ([#1413](https://github.com/theholocron/holocron/issues/1413)) ([b1735be](https://github.com/theholocron/holocron/commit/b1735be046c75540a2c5ed897fb8acdc903b229c)), closes [#1397](https://github.com/theholocron/holocron/issues/1397)

### Documentation

* **agents:** 📝 point the repo map at the folders in this monorepo ([#1358](https://github.com/theholocron/holocron/issues/1358)) ([84cc3bc](https://github.com/theholocron/holocron/commit/84cc3bc6016c6a5277c964faa724780391f01c96)), closes [#1321](https://github.com/theholocron/holocron/issues/1321)

### Chores

* **platform:** ♻️ build every package from one root tsdown config ([#1375](https://github.com/theholocron/holocron/issues/1375)) ([d8e7a7d](https://github.com/theholocron/holocron/commit/d8e7a7dc87c377eefb2c7e5f29cbaed74f912666)), closes [#1364](https://github.com/theholocron/holocron/issues/1364)
* **platform:** ♻️ resolve the in-repo packages from the workspace ([#1370](https://github.com/theholocron/holocron/issues/1370)) ([26c62c2](https://github.com/theholocron/holocron/commit/26c62c2b32124177339fecc2fdf66f808c1981c3)), closes [#1292](https://github.com/theholocron/holocron/issues/1292) [#1367](https://github.com/theholocron/holocron/issues/1367) [#1364](https://github.com/theholocron/holocron/issues/1364)
* **platform:** 🗂️ organize the pnpm catalogs by group and add a who-uses-what report ([#1384](https://github.com/theholocron/holocron/issues/1384)) ([49246a3](https://github.com/theholocron/holocron/commit/49246a3ea3652a6db9539f947fd73a93c7c5370c)), closes [#1380](https://github.com/theholocron/holocron/issues/1380)

## [1.57.1-alpha.1](https://github.com/theholocron/holocron/compare/clients-v1.57.0...clients-v1.57.1-alpha.1) (2026-10-29)

### Bug Fixes

* **google-client:** 🐛 move googleapis and google-auth-library to current releases together ([#1295](https://github.com/theholocron/holocron/issues/1295)) ([97b5160](https://github.com/theholocron/holocron/commit/97b5160f97ed942ac5c2d442da08cb5adb1ead73)), closes [#1289](https://github.com/theholocron/holocron/issues/1289) [#1294](https://github.com/theholocron/holocron/issues/1294)

### Documentation

* **clients:** 📝 move the package pages into the docs site ([1ef9d41](https://github.com/theholocron/holocron/commit/1ef9d41be303615ddfdd62cc8faf4b615b298202)), closes [#1211](https://github.com/theholocron/holocron/issues/1211)
* **clients:** 📝 state the MIT license in the READMEs ([4f21d31](https://github.com/theholocron/holocron/commit/4f21d31656f51f94b8176a55c2a1293d4338a9d2)), closes [#1211](https://github.com/theholocron/holocron/issues/1211)

### Chores

* **clients:** 🔧 adapt the imported packages to the workspace ([00f5dc3](https://github.com/theholocron/holocron/commit/00f5dc3e4a9016af8922432bd6e9faeb961cce7b)), closes [#1211](https://github.com/theholocron/holocron/issues/1211)

## [1.57.0](https://github.com/theholocron/clients/compare/v1.56.0...v1.57.0) (2026-10-28)

## [1.56.0](https://github.com/theholocron/clients/compare/v1.55.0...v1.56.0) (2026-10-28)

## [1.55.0](https://github.com/theholocron/clients/compare/v1.54.2...v1.55.0) (2026-10-27)

## [1.54.2](https://github.com/theholocron/clients/compare/v1.54.1...v1.54.2) (2026-10-27)

## [1.54.1](https://github.com/theholocron/clients/compare/v1.54.0...v1.54.1) (2026-10-27)

## [1.54.0](https://github.com/theholocron/clients/compare/v1.53.1...v1.54.0) (2026-10-27)

## [1.53.1](https://github.com/theholocron/clients/compare/v1.53.0...v1.53.1) (2026-10-27)

## [1.53.0](https://github.com/theholocron/clients/compare/v1.52.0...v1.53.0) (2026-10-26)

## [1.52.0](https://github.com/theholocron/clients/compare/v1.51.0...v1.52.0) (2026-10-26)

## [1.51.0](https://github.com/theholocron/clients/compare/v1.50.0...v1.51.0) (2026-10-26)

## [1.50.0](https://github.com/theholocron/clients/compare/v1.49.0...v1.50.0) (2026-10-26)

## [1.49.0](https://github.com/theholocron/clients/compare/v1.48.0...v1.49.0) (2026-10-26)

## [1.48.0](https://github.com/theholocron/clients/compare/v1.47.1...v1.48.0) (2026-10-24)

## [1.47.1](https://github.com/theholocron/clients/compare/v1.47.0...v1.47.1) (2026-10-24)

## [1.47.0](https://github.com/theholocron/clients/compare/v1.46.0...v1.47.0) (2026-10-24)

## [1.46.0](https://github.com/theholocron/clients/compare/v1.45.0...v1.46.0) (2026-10-24)

## [1.45.0](https://github.com/theholocron/clients/compare/v1.44.0...v1.45.0) (2026-10-24)

## [1.44.0](https://github.com/theholocron/clients/compare/v1.43.1...v1.44.0) (2026-10-23)

## [1.43.1](https://github.com/theholocron/clients/compare/v1.43.0...v1.43.1) (2026-10-22)

## [1.43.0](https://github.com/theholocron/clients/compare/v1.42.1...v1.43.0) (2026-10-22)

## [1.42.1](https://github.com/theholocron/clients/compare/v1.42.0...v1.42.1) (2026-10-16)

## [1.42.0](https://github.com/theholocron/clients/compare/v1.41.0...v1.42.0) (2026-10-13)

## [1.41.0](https://github.com/theholocron/clients/compare/v1.40.0...v1.41.0) (2026-10-13)

## [1.40.0](https://github.com/theholocron/clients/compare/v1.39.0...v1.40.0) (2026-10-12)

## [1.39.0](https://github.com/theholocron/clients/compare/v1.38.0...v1.39.0) (2026-10-08)

## [1.38.0](https://github.com/theholocron/clients/compare/v1.37.1...v1.38.0) (2026-10-07)

## [1.37.1](https://github.com/theholocron/clients/compare/v1.37.0...v1.37.1) (2026-10-06)

## [1.37.0](https://github.com/theholocron/clients/compare/v1.36.0...v1.37.0) (2026-10-06)

## [1.36.0](https://github.com/theholocron/clients/compare/v1.35.0...v1.36.0) (2026-10-03)

## [1.35.0](https://github.com/theholocron/clients/compare/v1.34.0...v1.35.0) (2026-10-02)

## [1.34.0](https://github.com/theholocron/clients/compare/v1.33.0...v1.34.0) (2026-10-01)

## [1.33.0](https://github.com/theholocron/clients/compare/v1.32.1...v1.33.0) (2026-09-30)

## [1.32.1](https://github.com/theholocron/clients/compare/v1.32.0...v1.32.1) (2026-09-30)

## [1.32.0](https://github.com/theholocron/clients/compare/v1.31.0...v1.32.0) (2026-09-30)

## [1.31.0](https://github.com/theholocron/clients/compare/v1.30.0...v1.31.0) (2026-09-26)

## [1.30.0](https://github.com/theholocron/clients/compare/v1.29.0...v1.30.0) (2026-09-25)

## [1.29.0](https://github.com/theholocron/clients/compare/v1.28.0...v1.29.0) (2026-09-24)

## [1.28.0](https://github.com/theholocron/clients/compare/v1.27.0...v1.28.0) (2026-09-23)

## [1.27.0](https://github.com/theholocron/clients/compare/v1.26.0...v1.27.0) (2026-09-23)

## [1.26.0](https://github.com/theholocron/clients/compare/v1.25.0...v1.26.0) (2026-09-23)

## [1.25.0](https://github.com/theholocron/clients/compare/v1.24.0...v1.25.0) (2026-09-22)

## [1.24.0](https://github.com/theholocron/clients/compare/v1.23.0...v1.24.0) (2026-09-20)

## [1.23.0](https://github.com/theholocron/clients/compare/v1.22.0...v1.23.0) (2026-09-17)

## [1.22.0](https://github.com/theholocron/clients/compare/v1.21.0...v1.22.0) (2026-09-17)

## [1.21.0](https://github.com/theholocron/clients/compare/v1.20.0...v1.21.0) (2026-09-16)

## [1.20.0](https://github.com/theholocron/clients/compare/v1.19.0...v1.20.0) (2026-09-16)

## [1.19.0](https://github.com/theholocron/clients/compare/v1.18.0...v1.19.0) (2026-09-16)

## [1.18.0](https://github.com/theholocron/clients/compare/v1.17.0...v1.18.0) (2026-09-16)

## [1.17.0](https://github.com/theholocron/clients/compare/v1.16.1...v1.17.0) (2026-09-16)

## [1.16.1](https://github.com/theholocron/clients/compare/v1.16.0...v1.16.1) (2026-09-15)

## [1.16.0](https://github.com/theholocron/clients/compare/v1.15.1...v1.16.0) (2026-09-11)

## [1.15.1](https://github.com/theholocron/clients/compare/v1.15.0...v1.15.1) (2026-09-10)

## [1.15.0](https://github.com/theholocron/clients/compare/v1.14.2...v1.15.0) (2026-09-06)

## [1.14.2](https://github.com/theholocron/clients/compare/v1.14.1...v1.14.2) (2026-09-02)

## [1.14.1](https://github.com/theholocron/clients/compare/v1.14.0...v1.14.1) (2026-09-02)

## [1.14.0](https://github.com/theholocron/clients/compare/v1.13.0...v1.14.0) (2026-09-02)

## [1.13.0](https://github.com/theholocron/clients/compare/v1.12.0...v1.13.0) (2026-09-01)

## [1.12.0](https://github.com/theholocron/clients/compare/v1.11.2...v1.12.0) (2026-08-28)

## [1.11.2](https://github.com/theholocron/clients/compare/v1.11.1...v1.11.2) (2026-08-27)

## [1.11.0](https://github.com/theholocron/clients/compare/v1.10.3...v1.11.0) (2026-08-27)

## [1.10.3](https://github.com/theholocron/clients/compare/v1.10.2...v1.10.3) (2026-08-20)

## [1.10.2](https://github.com/theholocron/clients/compare/v1.10.1...v1.10.2) (2026-08-19)

## [1.10.1](https://github.com/theholocron/clients/compare/v1.10.0...v1.10.1) (2026-08-18)

## [1.10.0](https://github.com/theholocron/clients/compare/v1.9.0...v1.10.0) (2026-08-18)

## [1.9.0](https://github.com/theholocron/clients/compare/v1.8.0...v1.9.0) (2026-08-18)

## [1.8.0](https://github.com/theholocron/clients/compare/v1.7.1...v1.8.0) (2026-08-18)

## [1.7.1](https://github.com/theholocron/clients/compare/v1.7.0...v1.7.1) (2026-08-17)

## [1.7.0](https://github.com/theholocron/clients/compare/v1.6.7...v1.7.0) (2026-08-17)

## [1.6.7](https://github.com/theholocron/clients/compare/v1.6.6...v1.6.7) (2026-08-14)

## [1.6.6](https://github.com/theholocron/clients/compare/v1.6.5...v1.6.6) (2026-08-12)

## [1.6.5](https://github.com/theholocron/clients/compare/v1.6.4...v1.6.5) (2026-08-12)

## [1.6.4](https://github.com/theholocron/clients/compare/v1.6.3...v1.6.4) (2026-08-12)

## [1.6.3](https://github.com/theholocron/clients/compare/v1.6.2...v1.6.3) (2026-08-12)

## [1.6.2](https://github.com/theholocron/clients/compare/v1.6.1...v1.6.2) (2026-08-05)

## [1.6.1](https://github.com/theholocron/clients/compare/v1.6.0...v1.6.1) (2026-08-04)

## [1.6.0](https://github.com/theholocron/clients/compare/v1.5.6...v1.6.0) (2026-08-02)

## [1.5.6](https://github.com/theholocron/clients/compare/v1.5.5...v1.5.6) (2026-08-02)

## [1.5.5](https://github.com/theholocron/clients/compare/v1.5.4...v1.5.5) (2026-07-31)

## [1.5.4](https://github.com/theholocron/clients/compare/v1.5.3...v1.5.4) (2026-07-30)

## [1.5.3](https://github.com/theholocron/clients/compare/v1.5.2...v1.5.3) (2026-07-30)

## [1.5.2](https://github.com/theholocron/clients/compare/v1.5.1...v1.5.2) (2026-07-30)

## [1.5.1](https://github.com/theholocron/clients/compare/v1.5.0...v1.5.1) (2026-07-30)

## [1.5.0](https://github.com/theholocron/clients/compare/v1.4.2...v1.5.0) (2026-07-29)

## [1.4.2](https://github.com/theholocron/clients/compare/v1.4.1...v1.4.2) (2026-07-29)

## [1.4.1](https://github.com/theholocron/clients/compare/v1.4.0...v1.4.1) (2026-07-29)

## [1.4.0](https://github.com/theholocron/clients/compare/v1.3.5...v1.4.0) (2026-07-29)

## [1.3.5](https://github.com/theholocron/clients/compare/v1.3.4...v1.3.5) (2026-07-28)

## [1.3.4](https://github.com/theholocron/clients/compare/v1.3.3...v1.3.4) (2026-07-27)

## [1.3.3](https://github.com/theholocron/clients/compare/v1.3.2...v1.3.3) (2026-07-22)

## [1.3.2](https://github.com/theholocron/clients/compare/v1.3.1...v1.3.2) (2026-07-22)

## [1.3.1](https://github.com/theholocron/clients/compare/v1.3.0...v1.3.1) (2026-07-22)

## [1.3.0](https://github.com/theholocron/clients/compare/v1.2.0...v1.3.0) (2026-07-22)

## [1.2.0](https://github.com/theholocron/clients/compare/v1.1.0...v1.2.0) (2026-07-21)

## [1.1.0](https://github.com/theholocron/clients/compare/v1.0.2...v1.1.0) (2026-07-21)

## [1.0.2](https://github.com/theholocron/clients/compare/v1.0.1...v1.0.2) (2026-07-20)

## [1.0.1](https://github.com/theholocron/clients/compare/v1.0.0...v1.0.1) (2026-07-20)

## 1.0.0 (2026-07-20)

## [0.11.5](https://github.com/theholocron/clients/compare/v0.11.4...v0.11.5) (2026-07-20)

## [0.11.4](https://github.com/theholocron/clients/compare/v0.11.3...v0.11.4) (2026-07-20)

## [0.11.3](https://github.com/theholocron/clients/compare/v0.11.2...v0.11.3) (2026-07-20)

## [0.11.2](https://github.com/theholocron/clients/compare/v0.11.1...v0.11.2) (2026-07-19)

## [0.11.1](https://github.com/theholocron/clients/compare/v0.11.0...v0.11.1) (2026-07-19)

## [0.11.0](https://github.com/theholocron/clients/compare/v0.10.1...v0.11.0) (2026-07-19)

## [0.10.1](https://github.com/theholocron/clients/compare/v0.10.0...v0.10.1) (2026-07-18)

## [0.10.0](https://github.com/theholocron/clients/compare/v0.9.0...v0.10.0) (2026-07-18)

## [0.9.0](https://github.com/theholocron/clients/compare/v0.8.1...v0.9.0) (2026-07-18)

## [0.8.1](https://github.com/theholocron/clients/compare/v0.8.0...v0.8.1) (2026-07-18)

## [0.8.0](https://github.com/theholocron/clients/compare/v0.7.0...v0.8.0) (2026-07-17)

## [0.7.0](https://github.com/theholocron/clients/compare/v0.6.2...v0.7.0) (2026-07-17)

## [0.6.2](https://github.com/theholocron/clients/compare/v0.6.1...v0.6.2) (2026-07-17)

## [0.6.1](https://github.com/theholocron/clients/compare/v0.6.0...v0.6.1) (2026-07-17)

## [0.6.0](https://github.com/theholocron/clients/compare/v0.5.0...v0.6.0) (2026-07-17)

## [0.5.0](https://github.com/theholocron/clients/compare/v0.4.0...v0.5.0) (2026-07-17)

## [0.4.0](https://github.com/theholocron/clients/compare/v0.3.2...v0.4.0) (2026-07-16)

## [0.3.2](https://github.com/theholocron/clients/compare/v0.3.1...v0.3.2) (2026-07-16)

## [0.3.1](https://github.com/theholocron/clients/compare/v0.3.0...v0.3.1) (2026-07-16)

## [0.3.0](https://github.com/theholocron/clients/compare/v0.2.3...v0.3.0) (2026-07-16)

## [0.2.3](https://github.com/theholocron/clients/compare/v0.2.2...v0.2.3) (2026-07-15)

## [0.2.2](https://github.com/theholocron/clients/compare/v0.2.1...v0.2.2) (2026-07-13)

## [0.2.1](https://github.com/theholocron/clients/compare/v0.2.0...v0.2.1) (2026-07-13)

## [0.2.0](https://github.com/theholocron/clients/compare/v0.1.0...v0.2.0) (2026-07-13)
