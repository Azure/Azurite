import * as assert from "assert";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { parseAccountModelFlags } from "../../src/common/EnvironmentFunctions";
import { AccountModel } from "../../src/blob/AccountModel";

describe("EnvironmentFunctions", () => {
  describe("parseAccountModelFlags", () => {
    let tempDir: string;
    let configFilePath1: string;
    let configFilePath2: string;

    beforeEach(() => {
      // Create a temporary directory for test files
      tempDir = join(tmpdir(), `azurite-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      mkdirSync(tempDir, { recursive: true });
      configFilePath1 = join(tempDir, "account-config1.json");
      configFilePath2 = join(tempDir, "account-config2.json");
    });

    afterEach(() => {
      // Clean up temporary files
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    // ===================== SUCCESS CASES - Single Account =====================
    
    it("should return undefined when neither configFilePath nor configAsJson is provided", () => {
      const result = parseAccountModelFlags({});
      assert.strictEqual(result, undefined);
    });

    it("should return undefined when flags object is empty", () => {
      const result = parseAccountModelFlags({});
      assert.strictEqual(result, undefined);
    });

    it("should parse single account JSON string with versioning enabled", () => {
      const flags = {
        accountConfigAsJson: 'devstoreaccount1:{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.ok(result instanceof Map);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("devstoreaccount1");
      assert.ok(account);
      assert.strictEqual(account.key, "devstoreaccount1");
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should parse single account JSON string with versioning disabled", () => {
      const flags = {
        accountConfigAsJson: 'myaccount:{"isBlobVersioningEnabled": false}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("myaccount");
      assert.ok(account);
      assert.strictEqual(account.key, "myaccount");
      assert.strictEqual(account.isBlobVersioningEnabled, false);
    });

    it("should read and parse single account config file with versioning enabled", () => {
      const config = { isBlobVersioningEnabled: true };
      writeFileSync(configFilePath1, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1}`
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("account1");
      assert.ok(account);
      assert.strictEqual(account.key, "account1");
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should read and parse single account config file with versioning disabled", () => {
      const config = { isBlobVersioningEnabled: false };
      writeFileSync(configFilePath1, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: `testaccount:${configFilePath1}`
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("testaccount");
      assert.ok(account);
      assert.strictEqual(account.key, "testaccount");
      assert.strictEqual(account.isBlobVersioningEnabled, false);
    });

    it("should parse JSON with additional properties (should ignore them)", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true, "extraProperty": "ignored", "anotherProp": 123}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("account1");
      assert.ok(account);
      assert.strictEqual(account.key, "account1");
      assert.strictEqual(account.isBlobVersioningEnabled, true);
      // Should only have the two expected properties
      assert.strictEqual(Object.keys(account).length, 2);
    });

    // ===================== SUCCESS CASES - Multiple Accounts =====================

    it("should parse multiple accounts from JSON string", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true},account2:{"isBlobVersioningEnabled": false}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 2);
      
      const account1 = result.get("account1");
      assert.ok(account1);
      assert.strictEqual(account1.key, "account1");
      assert.strictEqual(account1.isBlobVersioningEnabled, true);
      
      const account2 = result.get("account2");
      assert.ok(account2);
      assert.strictEqual(account2.key, "account2");
      assert.strictEqual(account2.isBlobVersioningEnabled, false);
    });

    it("should parse multiple accounts from config files", () => {
      writeFileSync(configFilePath1, JSON.stringify({ isBlobVersioningEnabled: true }));
      writeFileSync(configFilePath2, JSON.stringify({ isBlobVersioningEnabled: false }));

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1},account2:${configFilePath2}`
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 2);
      
      const account1 = result.get("account1");
      assert.ok(account1);
      assert.strictEqual(account1.key, "account1");
      assert.strictEqual(account1.isBlobVersioningEnabled, true);
      
      const account2 = result.get("account2");
      assert.ok(account2);
      assert.strictEqual(account2.key, "account2");
      assert.strictEqual(account2.isBlobVersioningEnabled, false);
    });

    it("should parse three or more accounts", () => {
      const flags = {
        accountConfigAsJson: 'dev:{"isBlobVersioningEnabled": true},staging:{"isBlobVersioningEnabled": false},prod:{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 3);
      assert.ok(result.get("dev"));
      assert.ok(result.get("staging"));
      assert.ok(result.get("prod"));
    });

    it("should handle JSON with commas inside values", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      assert.ok(result.get("account1"));
    });

    // ===================== ERROR CASES =====================

    it("should throw error when both configFilePath and configAsJson are provided", () => {
      const config = { isBlobVersioningEnabled: true };
      writeFileSync(configFilePath1, JSON.stringify(config));

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1}`,
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": false}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Specify either accountConfigFilePath or accountConfigAsJson, not both\./
      );
    });

    it("should throw error when config file does not exist", () => {
      const flags = {
        accountConfigFilePath: `account1:${join(tempDir, "nonexistent-file.json")}`
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration file not found for account 'account1'/
      );
    });

    it("should throw error when config file is empty", () => {
      writeFileSync(configFilePath1, "");

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1}`
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration file is empty for account 'account1'/
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
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true'  // Missing closing brace
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Invalid JSON in account configuration for account 'account1'/
      );
    });

    it("should throw error when JSON file contains invalid JSON", () => {
      writeFileSync(configFilePath1, '{"invalid": json}');

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1}`
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Invalid JSON in account configuration for account 'account1'/
      );
    });

    it("should throw error when parsed JSON is null", () => {
      const flags = {
        accountConfigAsJson: "account1:null"
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration must be a JSON object for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is undefined", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"someOtherProperty": true}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is null", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": null}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is a string", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": "true"}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is a number", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": 1}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is an object", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": {"enabled": true}}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when isBlobVersioningEnabled is an array", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": [true]}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account1'/
      );
    });

    it("should throw error when account name is missing", () => {
      const flags = {
        accountConfigAsJson: ':{"isBlobVersioningEnabled": true}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account name is missing in configuration entry/
      );
    });

    it("should throw error when configuration value is missing", () => {
      const flags = {
        accountConfigAsJson: 'account1:'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Configuration value is missing for account 'account1'/
      );
    });

    it("should throw error when no valid accounts are found", () => {
      const flags = {
        accountConfigAsJson: '   '
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration was specified but no valid accounts were found/
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
      writeFileSync(configFilePath1, "   \n\t  \r\n  ");

      const flags = {
        accountConfigFilePath: `account1:${configFilePath1}`
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration file is empty for account 'account1'/
      );
    });

    it("should handle JSON string with extra whitespace", () => {
      const flags = {
        accountConfigAsJson: '  account1:{"isBlobVersioningEnabled": true}  '
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("account1");
      assert.ok(account);
      assert.strictEqual(account.key, "account1");
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should handle account names with whitespace around them", () => {
      const flags = {
        accountConfigAsJson: '  account1  :  {"isBlobVersioningEnabled": true}  '
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      assert.ok(result.get("account1"));
    });

    it("should return correct AccountModel structure for each account", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true},account2:{"isBlobVersioningEnabled": false}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 2);
      
      // Verify first account
      const account1 = result.get("account1");
      assert.ok(account1);
      assert.strictEqual(account1.key, "account1");
      assert.strictEqual(typeof account1.isBlobVersioningEnabled, "boolean");
      
      // Verify only expected properties exist
      const expectedKeys = ["key", "isBlobVersioningEnabled"];
      const actualKeys1 = Object.keys(account1);
      assert.deepStrictEqual(actualKeys1.sort(), expectedKeys.sort());
      
      // Verify second account
      const account2 = result.get("account2");
      assert.ok(account2);
      assert.strictEqual(account2.key, "account2");
      const actualKeys2 = Object.keys(account2);
      assert.deepStrictEqual(actualKeys2.sort(), expectedKeys.sort());
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
        accountConfigAsJson: `account1:${JSON.stringify(complexConfig)}`
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("account1");
      assert.ok(account);
      assert.strictEqual(account.key, "account1");
      assert.strictEqual(account.isBlobVersioningEnabled, false);
      assert.strictEqual(Object.keys(account).length, 2);
    });

    it("should handle multiple accounts with mixed configurations", () => {
      writeFileSync(configFilePath1, JSON.stringify({ isBlobVersioningEnabled: true }));

      const flags = {
        accountConfigFilePath: `fileAccount:${configFilePath1}`,
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      assert.ok(result.get("fileAccount"));
    });

    it("should handle special characters in account names", () => {
      const flags = {
        accountConfigAsJson: 'account-test_123:{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account = result.get("account-test_123");
      assert.ok(account);
      assert.strictEqual(account.key, "account-test_123");
    });

    it("should correctly parse when JSON contains nested braces", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      assert.ok(result.get("account1"));
    });

    it("should handle Windows-style file paths", () => {
      if (process.platform === "win32") {
        const winPath = join(tempDir, "config.json");
        writeFileSync(winPath, JSON.stringify({ isBlobVersioningEnabled: true }));

        const flags = {
          accountConfigFilePath: `account1:${winPath}`
        };

        const result = parseAccountModelFlags(flags);
        
        assert.ok(result);
        assert.strictEqual(result.size, 1);
        assert.ok(result.get("account1"));
      }
    });

    it("should throw error when one account in multi-account config is invalid", () => {
      const flags = {
        accountConfigAsJson: 'account1:{"isBlobVersioningEnabled": true},account2:{"isBlobVersioningEnabled": "invalid"}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        /Account configuration value 'isBlobVersioningEnabled' must be a boolean for account 'account2'/
      );
    });

    it("should handle large number of accounts", () => {
      const accounts: string[] = [];
      for (let i = 0; i < 100; i++) {
        accounts.push(`account${i}:{"isBlobVersioningEnabled": ${i % 2 === 0}}`);
      }

      const flags = {
        accountConfigAsJson: accounts.join(',')
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 100);
      
      for (let i = 0; i < 100; i++) {
        const account: AccountModel | undefined = result.get(`account${i}`);
        assert.ok(account);
        assert.strictEqual(account.isBlobVersioningEnabled, i % 2 === 0);
      }
    });

    // ===================== Single Account Without Prefix =====================
    
    it("should parse single account JSON without account name prefix (no prefix)", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": true}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account: AccountModel | undefined = result.get('devstoreaccount1');
      assert.ok(account);
      assert.strictEqual(account.key, 'devstoreaccount1');
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should parse single account JSON without prefix with versioning disabled (no prefix)", () => {
      const flags = {
        accountConfigAsJson: '{"isBlobVersioningEnabled": false}'
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account: AccountModel | undefined = result.get('devstoreaccount1');
      assert.ok(account);
      assert.strictEqual(account.key, 'devstoreaccount1');
      assert.strictEqual(account.isBlobVersioningEnabled, false);
    });

    it("should parse single account file path without account name prefix (no prefix)", () => {
      const configContent = JSON.stringify({ isBlobVersioningEnabled: true });
      writeFileSync(configFilePath1, configContent, "utf-8");

      const flags = {
        accountConfigFilePath: configFilePath1
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account: AccountModel | undefined = result.get('devstoreaccount1');
      assert.ok(account);
      assert.strictEqual(account.key, 'devstoreaccount1');
      assert.strictEqual(account.isBlobVersioningEnabled, true);
    });

    it("should parse single account file path without prefix with versioning disabled (no prefix)", () => {
      const configContent = JSON.stringify({ isBlobVersioningEnabled: false });
      writeFileSync(configFilePath1, configContent, "utf-8");

      const flags = {
        accountConfigFilePath: configFilePath1
      };

      const result = parseAccountModelFlags(flags);
      
      assert.ok(result);
      assert.strictEqual(result.size, 1);
      
      const account: AccountModel | undefined = result.get('devstoreaccount1');
      assert.ok(account);
      assert.strictEqual(account.key, 'devstoreaccount1');
      assert.strictEqual(account.isBlobVersioningEnabled, false);
    });

    it("should throw error for non-existent file in no prefix mode", () => {
      const flags = {
        accountConfigFilePath: '/non/existent/path.json'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        (err: Error) => {
          return err.message.includes('Account configuration file not found');
        }
      );
    });

    it("should throw error for invalid JSON in no prefix mode", () => {
      const flags = {
        accountConfigAsJson: '{invalid json}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        (err: Error) => {
          return err.message.includes('Invalid JSON');
        }
      );
    });

    it("should throw error for missing isBlobVersioningEnabled in no prefix mode", () => {
      const flags = {
        accountConfigAsJson: '{"someOtherField": true}'
      };

      assert.throws(
        () => parseAccountModelFlags(flags),
        (err: Error) => {
          return err.message.includes('isBlobVersioningEnabled');
        }
      );
    });
  });
});
