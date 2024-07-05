import assert = require("assert");

import ConditionalHeadersAdapter from "../../src/blob/conditions/ConditionalHeadersAdapter";
import ConditionResourceAdapter from "../../src/blob/conditions/ConditionResourceAdapter";
import ReadConditionalHeadersValidator from "../../src/blob/conditions/ReadConditionalHeadersValidator";
import WriteConditionalHeadersValidator from "../../src/blob/conditions/WriteConditionalHeadersValidator";
import StorageErrorFactory from "../../src/blob/errors/StorageErrorFactory";
import Context from "../../src/blob/generated/Context";
import {
  BlobModel,
  ContainerModel
} from "../../src/blob/persistence/IBlobMetadataStore";

const context = { contextId: "" } as Context;

describe("ConditionalHeadersAdapter", () => {
  it("Should work with undefined values @loki @sql", () => {
    const validator = new ConditionalHeadersAdapter(context);
    assert.deepStrictEqual(validator.ifModifiedSince, undefined);
    assert.deepStrictEqual(validator.ifUnmodifiedSince, undefined);
    assert.deepStrictEqual(validator.ifMatch, undefined);
    assert.deepStrictEqual(validator.ifNoneMatch, undefined);
  });

  it("Should work with single etags @loki @sql", () => {
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2020/01/01"),
      ifUnmodifiedSince: new Date("2020/02/01"),
      ifMatch: "etag1",
      ifNoneMatch: "etag2"
    };

    const validator = new ConditionalHeadersAdapter(
      context,
      modifiedAccessConditions
    );
    assert.deepStrictEqual(
      validator.ifModifiedSince,
      modifiedAccessConditions.ifModifiedSince
    );
    assert.deepStrictEqual(
      validator.ifUnmodifiedSince,
      modifiedAccessConditions.ifUnmodifiedSince
    );
    assert.deepStrictEqual(validator.ifMatch, [
      modifiedAccessConditions.ifMatch
    ]);
    assert.deepStrictEqual(validator.ifNoneMatch, [
      modifiedAccessConditions.ifNoneMatch
    ]);
  });

  it("Should work with multi etags @loki @sql", () => {
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2020/01/01"),
      ifUnmodifiedSince: new Date("2020/02/01"),
      ifMatch: "etag1,etag2",
      ifNoneMatch: "etag3,etag4,etag5"
    };

    const validator = new ConditionalHeadersAdapter(
      context,
      modifiedAccessConditions
    );
    assert.deepStrictEqual(
      validator.ifModifiedSince,
      modifiedAccessConditions.ifModifiedSince
    );
    assert.deepStrictEqual(
      validator.ifUnmodifiedSince,
      modifiedAccessConditions.ifUnmodifiedSince
    );
    assert.deepStrictEqual(validator.ifMatch, ["etag1", "etag2"]);
    assert.deepStrictEqual(validator.ifNoneMatch, ["etag3", "etag4", "etag5"]);
  });

  it("Should work with etags with quotes @loki @sql", () => {
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2020/01/01"),
      ifUnmodifiedSince: new Date("2020/02/01"),
      ifMatch: '"etag1","etag2"',
      ifNoneMatch: 'etag3,"etag4",etag5'
    };

    const validator = new ConditionalHeadersAdapter(
      context,
      modifiedAccessConditions
    );
    assert.deepStrictEqual(
      validator.ifModifiedSince,
      modifiedAccessConditions.ifModifiedSince
    );
    assert.deepStrictEqual(
      validator.ifUnmodifiedSince,
      modifiedAccessConditions.ifUnmodifiedSince
    );
    assert.deepStrictEqual(validator.ifMatch, ["etag1", "etag2"]);
    assert.deepStrictEqual(validator.ifNoneMatch, ["etag3", "etag4", "etag5"]);
  });
});

describe("ConditionResourceAdapter", () => {
  it("Should work with undefined or null resource @loki @sql", () => {
    const conditionResourceAdapterUndefined = new ConditionResourceAdapter(
      undefined
    );
    assert.deepStrictEqual(conditionResourceAdapterUndefined.exist, false);

    const conditionResourceAdapterNull = new ConditionResourceAdapter(null);
    assert.deepStrictEqual(conditionResourceAdapterNull.exist, false);
  });

  it("Should work with blob model @loki @sql", () => {
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2018/01/01")
      }
    } as BlobModel;

    const conditionResourceAdapter = new ConditionResourceAdapter(blobModel);
    assert.deepStrictEqual(conditionResourceAdapter.exist, true);
    assert.deepStrictEqual(conditionResourceAdapter.etag, "etag1");
    assert.deepStrictEqual(
      conditionResourceAdapter.lastModified,
      blobModel.properties.lastModified
    );
  });

  it("Should work with container model @loki @sql", () => {
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date()
      }
    } as ContainerModel;

    const conditionResourceAdapter = new ConditionResourceAdapter(blobModel);
    assert.deepStrictEqual(conditionResourceAdapter.exist, true);
    assert.deepStrictEqual(conditionResourceAdapter.etag, "etag1");

    blobModel.properties.lastModified.setMilliseconds(0);
    assert.deepStrictEqual(
      conditionResourceAdapter.lastModified,
      blobModel.properties.lastModified
    );
  });

  it("Should work with etag with quotes @loki @sql", () => {
    const blobModel = {
      properties: {
        etag: '"etag1"',
        lastModified: new Date()
      }
    } as ContainerModel;

    const conditionResourceAdapter = new ConditionResourceAdapter(blobModel);
    assert.deepStrictEqual(conditionResourceAdapter.exist, true);
    assert.deepStrictEqual(conditionResourceAdapter.etag, "etag1");

    blobModel.properties.lastModified.setMilliseconds(0);
    assert.deepStrictEqual(
      conditionResourceAdapter.lastModified,
      blobModel.properties.lastModified
    );
  });
});

describe("ReadConditionalHeadersValidator for exist resource", () => {
  it("Should return 412 precondition failed for failed if-match results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = { ifMatch: "etag1" };
    const blobModel = {
      properties: {
        etag: "etag2",
        lastModified: new Date()
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should not return 412 precondition failed for successful if-match results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = { ifMatch: "etag1" };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date()
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 304 Not Modified for failed if-none-match results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = { ifNoneMatch: 'etag0,"etag1"' };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date()
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getNotModified(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should not return 304 Not Modified for successful if-none-match results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = { ifNoneMatch: 'etag0,"etag3"' };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date()
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 304 Not Modified for failed if-modified-since results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2018/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getNotModified(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 304 Not Modified when if-modified-since same with lastModified @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2019/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getNotModified(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should not return 304 Not Modified for successful if-modified-since results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2020/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 412 precondition failed for failed if-unmodified-since results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifUnmodifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag2",
        lastModified: new Date("2020/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should not return 412 precondition failed when if-unmodified-since same with lastModified @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifUnmodifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag2",
        lastModified: new Date("2019/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should not return 412 precondition failed for successful if-unmodified-since results @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifUnmodifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag2",
        lastModified: new Date("2018/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 200 OK when all conditions match @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: "etag3",
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2019/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 412 Precondition Failed when if-none-match and if-unmodified-since fail among all conditions @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: '"etag1"',
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2021/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 200 OK when if-none-match fails all conditions @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: "etag1",
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2019/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 412 Precondition Failed when if-match and if-modified-since fail among all conditions @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: '"etag2"',
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag0",
        lastModified: new Date("2017/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 200 OK when if-modified-since fails all conditions @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: "etag3",
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2017/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 304 Not Modified when if-none-match and if-modified-since fail @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifNoneMatch: '"etag1"',
      ifModifiedSince: new Date("2018/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2017/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getNotModified(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });
});

describe("ReadConditionalHeadersValidator for nonexistent resource", () => {
  it("Should return 412 Precondition Failed for any ifMatch @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1"
    };

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 400 getUnsatisfiableCondition for if none-match value * @loki @sql", () => {
    const validator = new ReadConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifNoneMatch: "*"
    };

    const expectedError = StorageErrorFactory.getUnsatisfiableCondition(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });
});

describe("WriteConditionalHeadersValidator for nonexistent resource", () => {
  it("Should throw 400 Bad Request for invalid combinations conditional headers @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1",
      ifNoneMatch: '"etag2"',
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };

    const expectedError = StorageErrorFactory.getMultipleConditionHeadersNotSupported(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should throw 400 Bad Request for multi etags in ifMatch @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag1,etag2",
      ifNoneMatch: '"etag2"',
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };

    const expectedError = StorageErrorFactory.getMultipleConditionHeadersNotSupported(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should throw 400 Bad Request for multi etags in if-none-match @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag2",
      ifNoneMatch: '"etag2",*',
      ifModifiedSince: new Date("2018/01/01"),
      ifUnmodifiedSince: new Date("2020/01/01")
    };

    const expectedError = StorageErrorFactory.getMultipleConditionHeadersNotSupported(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should throw 412 Precondition Failed for any values in if-match @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: "etag2"
    };

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );

    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(undefined)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });
});

describe("WriteConditionalHeadersValidator for exist resource", () => {
  it("Should return 200 for successful if-none-match and failed if-modified-since @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifNoneMatch: '"etag2"',
      ifModifiedSince: new Date("2018/01/01")
    };

    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2017/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 200 for successful if-match and failed if-unmodified-since @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifMatch: '"etag1"',
      ifUnmodifiedSince: new Date("2018/01/01")
    };

    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2019/01/01")
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 200 for if-unmodified-since equal with lastModified @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifUnmodifiedSince: new Date()
    };

    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: modifiedAccessConditions.ifUnmodifiedSince
      }
    } as BlobModel;

    validator.validate(
      context,
      new ConditionalHeadersAdapter(context, modifiedAccessConditions),
      new ConditionResourceAdapter(blobModel)
    );
  });

  it("Should return 412 for if-modified-since equal with lastModifiedSince @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifModifiedSince: new Date()
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: modifiedAccessConditions.ifModifiedSince
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 412 for failed if-modified-since results @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifModifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2018/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });

  it("Should return 412 for failed if-unmodified-since results @loki @sql", () => {
    const validator = new WriteConditionalHeadersValidator();
    const modifiedAccessConditions = {
      ifUnmodifiedSince: new Date("2019/01/01")
    };
    const blobModel = {
      properties: {
        etag: "etag1",
        lastModified: new Date("2020/01/01")
      }
    } as BlobModel;

    const expectedError = StorageErrorFactory.getConditionNotMet(
      context.contextId!
    );
    try {
      validator.validate(
        context,
        new ConditionalHeadersAdapter(context, modifiedAccessConditions),
        new ConditionResourceAdapter(blobModel)
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, expectedError.statusCode);
      assert.deepStrictEqual(
        error.storageErrorCode,
        expectedError.storageErrorCode
      );
      assert.deepStrictEqual(
        error.storageErrorMessage,
        expectedError.storageErrorMessage
      );
      return;
    }

    assert.fail();
  });
});
