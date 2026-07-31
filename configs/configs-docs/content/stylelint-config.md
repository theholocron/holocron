---
title: Stylelint Config
description: Shared Stylelint CSS rules for theholocron projects.
---

`@theholocron/stylelint-config` provides the Stylelint configuration used across all theholocron front-end projects.

## Install

```bash
npm i -D @theholocron/stylelint-config stylelint
```

## Usage

In `.stylelintrc.cjs`:

```js
module.exports = {
  extends: ["@theholocron/stylelint-config"],
};
```
