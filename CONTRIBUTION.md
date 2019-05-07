# Contribution

## Development Environments

Visual Studio Code is the best editor for TypeScript. Install and configure following plugins and configurations before starting development.

### TSLint

To keep a persistence coding style, we use TSLint to find potential bugs. All developers should follow the same tslint.json defined in project.

### prettier

prettier is a tool helping automatically clean up our TypeScript codes. Recommend to open "FormatOnSave" feature of Visual Studio Code.

### Document This

This is useful to generate JSDoc for TypeScript codes.

### TypeScript Import Sorter

Used to automatically sort TypeScript import statements.

## Azurite V3 Features Implementation

Every Azure Storage REST APIs maps to one handler method. Handler methods throwing `NotImplementedError` should be implemented.

Every handler will talk to persistence layer directly. We make implements of persistency layer abstract by creating interfaces. `LokiBlobDataStore` is one of the implementation based on Loki database used by Azurite V3.

## Debug

In the root of the repository, we provided pre-defined debugging scripts. To make it easy to debug in Visual Studio Code with simple F5 click for debug configuration "Azurite Blob Service".

Or manually follow following steps to build and run:

```bash
npm install
npm run blob
```

## Testing

For every new implemented REST API and handler, there should at least 1 unit test case for covering.

We also predefined Visual Studio Code debug configuration "Current Mocha" for execute mocha test with current opended file.

Or manually execute all test cases:

```bash
npm install
npm run test
```

## PR

Make sure test cases are added for the changes you made. And send a PR to `dev` branch for Azurite V3 development, `dev-legacy` branch for Azurite V2.
