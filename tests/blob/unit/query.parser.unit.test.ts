import * as assert from "assert";
import parseQuery from "../../../src/blob/persistence/QueryInterpreter/QueryParser";
import Context from "../../../src/blob/generated/Context";

const testContext = new Context({contextId: "test"}, "testPath", {} as any, {} as any);

describe("Query Parser", () => {
    function runTestCases(name: string, testCases: {
        name: string
        originalQuery: string
        expectedQuery: string
        conditionsHeader?: string
    }[]) {
        describe(name, () => {

            for (const test of testCases) {
                it(test.name, () => {
                    const queryTree = parseQuery(testContext, test.originalQuery, test.conditionsHeader)
                    assert.strictEqual(queryTree.toString(), test.expectedQuery, "it should parse the query tree correctly")
                })
            }
        })
    }

    describe("Correct multiple conditions for a single tag", () => {
        runTestCases("range", [
            {
                name: "Exclusive range",
                originalQuery: "\"Date\" > '2025-03-01' and \"Date\" < '2025-03-02'",
                expectedQuery: '((Date gt "2025-03-01") and (Date lt "2025-03-02"))'
            },
            {
                name: "Inclusive range (left)",
                originalQuery: "\"Date\" >= '2025-03-01' and \"Date\" < '2025-03-02'",
                expectedQuery: '((Date gte "2025-03-01") and (Date lt "2025-03-02"))'
            },
            {
                name: "Inclusive range (right)",
                originalQuery: "\"Date\" > '2025-03-01' and \"Date\" <= '2025-03-02'",
                expectedQuery: '((Date gt "2025-03-01") and (Date lte "2025-03-02"))'
            },
            {
                name: "Inclusive range (both)",
                originalQuery: "\"Date\" >= '2025-03-01' and \"Date\" <= '2025-03-02'",
                expectedQuery: '((Date gte "2025-03-01") and (Date lte "2025-03-02"))'
            },
            {
                name: "Not equal + less than",
                originalQuery: "\"Date\" <> '2025-03-01' and \"Date\" < '2025-03-02'",
                expectedQuery: '((Date ne "2025-03-01") and (Date lt "2025-03-02"))',
                conditionsHeader: "x-ms-if-tags"
            },
            {
                name: "Not equal + less or equal than",
                originalQuery: "\"Date\" <> '2025-03-01' and \"Date\" <= '2025-03-02'",
                expectedQuery: '((Date ne "2025-03-01") and (Date lte "2025-03-02"))',
                conditionsHeader: "x-ms-if-tags"
            },
            {
                name: "Not equal + greater than",
                originalQuery: "\"Date\" <> '2025-03-01' and \"Date\" > '2025-03-02'",
                expectedQuery: '((Date ne "2025-03-01") and (Date gt "2025-03-02"))',
                conditionsHeader: "x-ms-if-tags"
            },
            {
                name: "Not equal + greater or equal than",
                originalQuery: "\"Date\" <> '2025-03-01' and \"Date\" >= '2025-03-02'",
                expectedQuery: '((Date ne "2025-03-01") and (Date gte "2025-03-02"))',
                conditionsHeader: "x-ms-if-tags"
            }
        ])
    })

    describe("Incorrect multiple conditions for a single tag", () => {
        const testCases = [
            {
                name: "Multiple equality conditions",
                query: "\"Date\" = '2025-03-01' and \"Date\" = '2025-03-02'"
            },
            {
                name: "Equality condition + less than",
                query: "\"Date\" = '2025-03-01' and \"Date\" < '2025-03-02'"
            },
            {
                name: "Equality condition + less or equal than",
                query: "\"Date\" = '2025-03-01' and \"Date\" <= '2025-03-02'"
            },
            {
                name: "Equality condition + greater than",
                query: "\"Date\" = '2025-03-01' and \"Date\" > '2025-03-02'"
            },
            {
                name: "Equality condition + greater or equal than",
                query: "\"Date\" = '2025-03-01' and \"Date\" >= '2025-03-02'"
            },
            {
                name: "Less than + less than",
                query: "\"Date\" < '2025-03-01' and \"Date\" < '2025-03-02'"
            },
            {
                name: "Less than + less or equal than",
                query: "\"Date\" < '2025-03-01' and \"Date\" <= '2025-03-02'"
            },
            {
                name: "Less or equal than + less than",
                query: "\"Date\" <= '2025-03-01' and \"Date\" < '2025-03-02'"
            },
            {
                name: "Less or equal than + less or equal than",
                query: "\"Date\" <= '2025-03-01' and \"Date\" <= '2025-03-02'"
            },
            {
                name: "Greater than + greater than",
                query: "\"Date\" > '2025-03-01' and \"Date\" > '2025-03-02'"
            },
            {
                name: "Greater than + greater or equal than",
                query: "\"Date\" > '2025-03-01' and \"Date\" >= '2025-03-02'"
            },
            {
                name: "Greater or equal than + greater than",
                query: "\"Date\" >= '2025-03-01' and \"Date\" > '2025-03-02'"
            },
            {
                name: "Greater or equal than + greater or equal than",
                query: "\"Date\" >= '2025-03-01' and \"Date\" >= '2025-03-02'"
            }
        ]

        for (const testCase of testCases) {
            it(testCase.name, () => {
                assert.throws(() => parseQuery(testContext, testCase.query), Error, "it should throw an error an error while parsing")
            })
        }
    })
})