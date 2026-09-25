import { strict as assert } from "assert";
import { ESLint } from "eslint";
import * as path from "path";

describe("ESLint TypeScript parser configuration @loki", () => {
  it("parses TypeScript source with the project lint configuration", async () => {
    const eslint = new ESLint({ cwd: path.resolve(__dirname, "..") });
    const [result] = await eslint.lintText(
      'interface LintFixture { value: string; }\nconst value: LintFixture = { value: "ok" };\nvoid value;\n',
      { filePath: "src/lintFixture.ts" }
    );

    assert.strictEqual(result.errorCount, 0, JSON.stringify(result.messages));
    assert.strictEqual(result.warningCount, 0, JSON.stringify(result.messages));
  });

  it("accepts a numeric literal with a trailing decimal point", async () => {
    const eslint = new ESLint({ cwd: path.resolve(__dirname, "..") });
    const [result] = await eslint.lintText("const value = 1.;\nvoid value;\n", {
      filePath: "src/lintFixture.ts",
    });

    assert.strictEqual(result.errorCount, 0, JSON.stringify(result.messages));
    assert.strictEqual(result.warningCount, 0, JSON.stringify(result.messages));
  });

  it("enforces recommended TypeScript ESLint rules", async () => {
    const eslint = new ESLint({ cwd: path.resolve(__dirname, "..") });
    const [result] = await eslint.lintText(
      "interface Empty {}\nconst value: Empty = {};\nvoid value;\n",
      { filePath: "src/lintFixture.ts" }
    );

    assert.strictEqual(result.errorCount, 1, JSON.stringify(result.messages));
    assert.strictEqual(result.warningCount, 0, JSON.stringify(result.messages));
    assert.strictEqual(result.messages.length, 1, JSON.stringify(result.messages));
    assert.strictEqual(
      result.messages[0].ruleId,
      "@typescript-eslint/no-empty-object-type"
    );
  });
});
