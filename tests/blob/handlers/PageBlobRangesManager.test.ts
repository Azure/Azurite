import assert = require("assert");

import PageBlobRangesManager from "../../../src/blob/handlers/PageBlobRangesManager";

describe("PageBlobRangesManager", () => {
  it("selectImpactedRanges @loki @sql", () => {
    const testCases = [
      {
        ranges: [],
        start: 0,
        end: 0,
        results: [Infinity, -1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 10,
            end: 19
          },
          {
            start: 20,
            end: 29
          }
        ],
        start: 0,
        end: 0,
        results: [0, 0]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 10,
            end: 19
          },
          {
            start: 20,
            end: 29
          }
        ],
        start: 0,
        end: 9,
        results: [0, 0]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 10,
            end: 19
          },
          {
            start: 20,
            end: 29
          }
        ],
        start: 0,
        end: 10,
        results: [0, 1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 10,
            end: 19
          },
          {
            start: 20,
            end: 29
          }
        ],
        start: 5,
        end: 15,
        results: [0, 1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 10,
            end: 19
          },
          {
            start: 20,
            end: 29
          }
        ],
        start: 10,
        end: 15,
        results: [1, 1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 10,
        end: 15,
        results: [1, 0]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 10,
        end: 19,
        results: [1, 0]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 10,
        end: 20,
        results: [1, 1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 50,
        end: 55,
        results: [Infinity, 2]
      },
      {
        ranges: [
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 10,
        end: 15,
        results: [0, -1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 21,
        end: 21,
        results: [1, 1]
      },
      {
        ranges: [
          {
            start: 0,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 8,
        end: 40,
        results: [0, 2]
      },
      {
        ranges: [
          {
            start: 1,
            end: 9
          },
          {
            start: 20,
            end: 29
          },
          {
            start: 40,
            end: 49
          }
        ],
        start: 0,
        end: 100,
        results: [0, 2]
      }
    ];

    const manager = new PageBlobRangesManager();

    testCases.forEach(testCase => {
      const results = manager.selectImpactedRanges(
        testCase.ranges as any,
        testCase.start,
        testCase.end
      );
      assert.deepStrictEqual(
        results,
        testCase.results,
        `testCase: ${JSON.stringify(testCase)}`
      );
    });
  });
});
