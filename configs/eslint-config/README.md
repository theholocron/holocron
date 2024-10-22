# ESLint Config

A [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files) writing well-formed Javascript.

## Installation

```bash
npm install --save-dev @theholocron/eslint-config
```

## Usage

In your project `eslint.config.js` add the following:

```javascript
import theHolocron, {
	theHolocronCypress,
	theHolocronStorybook,
} from "@theholocron/eslint-config";

export default [...theHolocron, ...theHolocronStorybook, ...theHolocronCypress];
```
