<!-- editorconfig-checker-disable-file -->

# Storybook Config

A [Storybook configuration](https://storybook.js.org/docs/configure) with addons and theme setup for React component libraries.

## Installation

```bash
npm install --save-dev @theholocron/storybook-config
```

Install the peer dependencies for the addons you use (all are optional):

```bash
npm install --save-dev storybook @storybook/react @storybook/react-vite \
  @storybook/addon-docs @storybook/addon-a11y @storybook/addon-links \
  @storybook/addon-themes @storybook/addon-coverage @storybook/addon-vitest \
  @storybook/test-runner @chromatic-com/storybook storybook-addon-pseudo-states \
  @testing-library/react @testing-library/jest-dom jsdom react react-dom
```

## Usage

See the [react-template `.storybook`](https://github.com/theholocron/react-template/tree/main/.storybook) directory for a complete working example.
