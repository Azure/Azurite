# Contribution

> Go to [GitHub project](https://github.com/Azure/Azurite/projects) page or [GitHub issues](https://github.com/Azure/Azurite/issues) for the milestone and TODO items we are used for tracking upcoming features and bug fixes.

## Azurite V3 Features Implementation

Every Azure Storage REST APIs maps to one handler method. Handler methods throwing `NotImplementedError` should be implemented.

Every handler will talk to persistence layer directly. We make implements of persistency layer abstract by creating interfaces. `LokiBlobDataStore` is one of the implementation based on Loki database used by Azurite V3.

## Debug

In the root of the repository, we have provided pre-defined debugging scripts. This makes it easy to debug in Visual Studio Code with simple F5 click for debug configuration "Azurite Blob Service" or "Azurite Queue Service".

Manually follow following steps to build and run all services in Azurite:

```bash
npm install
npm run azurite
```

Or build and run a certain service like Blob service:

```bash
npm install
npm run blob
```

## Develop for Visual Studio Code Extension

Select and start Visual Studio Code debug configuration "Run Extension".

## Testing

For every newly implemented REST API and handler, there should be at least coverage from 1 unit / integration test case.

We also provide a predefined Visual Studio Code debug configuration "Current Mocha", allowing you to execute mocha tests within the currently opended file.

Or manually execute all test cases:

```bash
npm install
npm run test
```

## PR

Make sure test cases are added for the changes you made. And send a PR to `dev` branch for Azurite V3 or later development, `dev-legacy` branch for Azurite V2.

## Regeneration Protocol Layer from Swagger by Autorest

1. Install autorest by `npm install -g autorest`
2. Clone autorest TypeScript server generator to some local path
   - `git clone --recursive https://github.com/xiaoningliu/autorest.typescript.server`
3. Go to cloned autorest.typescript.server folder and build autorest server
   - `npm install`
   - `npm install -g gulp`
   - `npm run build`
4. Go to package.json of Azurite repo, update `build:autorest:blob` and `build:autorest:queue` to point to the local generator cloned path
5. Generate by go to Azurite root folder and run
   - `npm run build:autorest:queue`
   - `npm run build:autorest:blob`
