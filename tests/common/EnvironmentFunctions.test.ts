import * as assert from "assert";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { parseAccountModelFlags } from "../../src/common/EnvironmentFunctions";
import { AccountModel } from "../../src/blob/AccountModel";

describe("EnvironmentFunctions", () => {
  describe("parseAccountModelFlags", () => {
    let tempDir: string;
    let configFilePath: string;

    beforeEach(() => {
      // Create a temporary directory for test files
      tempDir = join(tmpdir(), `azurite-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      mkdirSync(tempDir, { recursive: true });
      configFilePath = join(tempDir, "account-config.json");
    });

    afterEach(() => {
      // Clean up temporary files
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    // ===================== SUCCESS CASES =====================
    
    it("should return undefined when neither configFilePath nor configAsJson is provided", () => {
      const result = parseAccountModelFlags({});
      assert.strictEqual(result, undefined);
    });

    it("should return undefined when flags object is empty", () => {
      const result = parseAccountModelFlags({});
      assert.strictEqual(result, undefined);
    });

    it("should parse valid JSON string with versioning enabled", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, true);
    });

    it("should parse valid JSON string with versioning disabled", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": false}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, false);
    });

    it("should read and parse valid config file with versioning enabled", () => {
      const config = { isBlobVersioningEnabled: true };
      writeFileSync(configFilePath, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: configFilePath
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, true);
    });

    it("should read and parse valid config file with versioning disabled", () => {
      const config = { isBlobVersioningEnabled: false };
      writeFileSync(configFilePath, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: configFilePath
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, false);
    });

    it("should parse JSON with additional properties (should ignore them)", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": true, "extraProperty": "ignored", "anotherProp": 123}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, true);
      // Should only have the two expected properties
      assert.strictEqual(Object.keys(result).length, 2);
    });

    // ===================== ERROR CASES =====================

    it("should throw error when both configFilePath and configAsJson are provided", () => {
      const config = { isBlobVersioningEnabled: true };
      writeFileSync(configFilePath, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: configFilePath,
        accountConfigAsJson: '{"isBlobVersioningEnabled": false}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Specify either accountConfigFilePath or accountConfigAsJson, not both\./
      );
    });

    it("should throw error when config file does not exist", () => {
      const flags = {
        accountConfigFilePath: join(tempDir, "nonexistent-file.json")
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /ENOENT.*no such file or directory/
      );
    });

    it("should throw error when config file is empty", () => {
      writeFileSync(configFilePath, "");

      const flags = {
        accountConfigFilePath: configFilePath
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration was specified but, but it is empty/
      );
    });

    it("should return undefined when configAsJson is empty string", () => {
      const flags = {
        accountConfigAsJson: ""
      };

      const result = parseAccountModelFlags(flags);
      assert.strictEqual(result, undefined);
    });

    it("should throw error when JSON is invalid", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": true'  // Missing closing brace
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        SyntaxError
      );
    });

    it("should throw error when JSON file contains invalid JSON", () => {
      writeFileSync(configFilePath, '{"invalid": json}');

      const flags = {
        accountConfigFilePath: configFilePath
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        SyntaxError
      );
    });

    it("should throw error when parsed JSON is null", () => {
      const flags = {
        accountConfigAsJson: "null"
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration is invalid/
      );
    });

    it("should throw error when isBlobVersioningEnabled is undefined", () => {
      const flags = {
        accountConfigAsJson: '{"someOtherProperty": true}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    it("should throw error when isBlobVersioningEnabled is null", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": null}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    it("should throw error when isBlobVersioningEnabled is a string", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": "true"}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    it("should throw error when isBlobVersioningEnabled is a number", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": 1}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    it("should throw error when isBlobVersioningEnabled is an object", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": {"enabled": true}}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    it("should throw error when isBlobVersioningEnabled is an array", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": [true]}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value: isBlobVersioningEnabled must be a boolean/
      );
    });

    // ===================== EDGE CASES =====================

    it("should handle flags object with undefined values", () => {
      const flags = {
        accountConfigFilePath: undefined,
        accountConfigAsJson: undefined,
        someOtherFlag: "value"
      };

      const result = parseAccountModelFlags(flags);
      assert.strictEqual(result, undefined);
    });

    it("should handle config file with whitespace-only content", () => {
      writeFileSync(configFilePath, "   \n\t  \r\n  ");

      const flags = {
        accountConfigFilePath: configFilePath
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        SyntaxError
      );
    });

    it("should handle JSON string with extra whitespace", () => {
      const flags = {
        accountConfigAsJson: '  \n\t {"isBlobVersioningEnabled": true}  \r\n  '
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, true);
    });

    it("should return correct AccountModel structure", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      
      // Verify it matches AccountModel interface
      const accountModel: AccountModel = result;
      assert.strictEqual(accountModel.key, "account");
      assert.strictEqual(typeof accountModel.isBlobVersioningEnabled, "boolean");
      
      // Verify only expected properties exist
      const expectedKeys = ["key", "isBlobVersioningEnabled"];
      const actualKeys = Object.keys(result);
      assert.deepStrictEqual(actualKeys.sort(), expectedKeys.sort());
    });

    it("should handle nested objects in config (should ignore extra properties)", () => {
      const complexConfig = {
        isBlobVersioningEnabled: false,
        database: {
          host: "localhost",
          port: 5432
        },
        features: ["versioning", "encryption"],
        metadata: {
          version: "1.0.0",
          author: "test"
        }
      };

      const flags = {
        accountConfigAsJson: JSON.stringify(complexConfig)
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.key, "account");
      assert.strictEqual(result.isBlobVersioningEnabled, false);
      assert.strictEqual(Object.keys(result).length, 2);
    });
  });
});
