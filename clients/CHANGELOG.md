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
