# Jest Preset

A [Jest preset](https://facebook.github.io/jest/docs/en/configuration.html#preset-string) for testing code within the Galaxy.

## Installation

```bash
npm install --save-dev @theholocron/jest-preset
```

## Usage

In your project `package.json` add the following:

```json
{
	"jest": {
		"displayName": "<project>",
		"preset": "@theholocron/jest-config"
	}
}
```

## How We Test

Currently we use [Jest](https://jestjs.io/) for our testing framework. There isn't much to our configuration that differs from what Jest provides out of the box with the following exceptions:

-   **Coverage**: we enforce coverage collection and require that all work be covered at least 80% at this time, with negligible reduction (< 1%) of coverage per PR
-   **Directory Naming**: while we do support the [same regex that Jest provides](https://jestjs.io/docs/en/configuration#testregex-string--arraystring), our convention is to co-locate all test files as close to the source as possible with the suffix of `.test` added.
