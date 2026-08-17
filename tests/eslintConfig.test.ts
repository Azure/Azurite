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
  });
});
