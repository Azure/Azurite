# Contribution

> Go to [GitHub project](https://github.com/Azure/Azurite/projects) page or [GitHub issues](https://github.com/Azure/Azurite/issues) for the milestone and TODO items we are used for tracking upcoming features and bug fixes.

## Development Environments

Visual Studio Code is the best editor for TypeScript. Install and configure following plugins and configurations before starting development.

### TSLint

To maintain a consistent coding style, we use TSLint to find potential bugs. All developers should follow the same tslint.json defined in project.

### prettier

prettier is a tool helping automatically clean up our TypeScript codes. Recommend to open "FormatOnSave" feature of Visual Studio Code.

### Document This

This is useful for generating JSDoc for TypeScript codes.

### TypeScript Import Sorter

Used to automatically sort TypeScript import statements.

## Azurite V3 Features Implementation

Every Azure Storage REST APIs maps to one handler method. Handler methods throwing `NotImplementedError` should be implemented.

Every handler will talk to persistence layer directly. We make implements of persistency layer abstract by creating interfaces. `LokiBlobDataStore` is one of the implementation based on Loki database used by Azurite V3.

## Debug

In the root of the repository, we have provided pre-defined debugging scripts. This makes it easy to debug in Visual Studio Code with simple F5 click for debug configuration "Azurite Blob Service".

Or manually follow following steps to build and run:

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
