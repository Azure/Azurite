import * as assert from "assert";
import LokiJsQueryTranscriberFactory from "../../../src/table/persistence/QueryTranscriber/LokiJsQueryTranscriberFactory";

describe("LokiJs Query Transcribing unit tests, also ensures backward compatability with earlier schemas:", () => {
  it("correctly transcribes a simple query with irregular whitespace", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "( )",
        expectedQuery: "return ( ( ) )"
      },
      {
        originalQuery: "(partitionKey eq 'test')",
        expectedQuery: "return ( ( item.properties.partitionKey === `test` ) )"
      },
      {
        originalQuery: "( partitionKey eq 'test' )",
        expectedQuery: "return ( ( item.properties.partitionKey === `test` ) )"
      },
      {
        originalQuery: "('test' eq partitionKey)",
        expectedQuery: "return ( ( `test` === item.properties.partitionKey ) )"
      },
      {
        originalQuery: "( 'test' eq partitionKey )",
        expectedQuery: "return ( ( `test` === item.properties.partitionKey ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type boolean", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myBoolean eq false )",
        expectedQuery: "return ( ( item.properties.myBoolean === false ) )"
      },
      {
        originalQuery: "( true eq myBoolean )",
        expectedQuery: "return ( ( true === item.properties.myBoolean ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type double", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myDouble lt 123.01 )",
        expectedQuery: "return ( ( item.properties.myDouble < 123.01 ) )"
      },
      {
        originalQuery: "( 123.01 gt myDouble )",
        expectedQuery: "return ( ( 123.01 > item.properties.myDouble ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type Guid", async () => {
    // use the expected response string to compare the reult to.
    // guid should have both simple string rep and base64 encoded
    // version for legacy schema compatibility
    const testArray = [
      {
        originalQuery:
          "(myGuid eq guid'12345678-1234-1234-1234-1234567890ab' )",
        expectedQuery:
          "return ( ( ( item.properties.myGuid === 'MTIzNDU2NzgtMTIzNC0xMjM0LTEyMzQtMTIzNDU2Nzg5MGFi' ) || ( item.properties.myGuid === '12345678-1234-1234-1234-1234567890ab' ) ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type string", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myString eq '123.01' )",
        expectedQuery: "return ( ( item.properties.myString === `123.01` ) )"
      },
      {
        originalQuery: "( '123.01L' eq myString )",
        expectedQuery: "return ( ( `123.01L` === item.properties.myString ) )"
      },
      {
        originalQuery: "( 'I am a string' eq myString )",
        expectedQuery:
          "return ( ( `I am a string` === item.properties.myString ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type integer", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myInt eq 123 )",
        expectedQuery: "return ( ( item.properties.myInt === 123 ) )"
      },
      {
        originalQuery: "( -123 lt myInt )",
        expectedQuery: "return ( ( -123 < item.properties.myInt ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type long", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myLong eq 123.01L )",
        expectedQuery: "return ( ( item.properties.myLong === '123.01' ) )"
      },
      {
        originalQuery: "( 123.01L eq myLong )",
        expectedQuery: "return ( ( '123.01' === item.properties.myLong ) )"
      },
      {
        originalQuery: "PartitionKey eq 'partition1' and int64Field eq 12345L",
        expectedQuery:
          "return ( item.properties.PartitionKey === `partition1` && item.properties.int64Field === '12345' )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type date", async () => {
    // use the expected response string to compare the reult to.
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const newTimeStamp = timestamp.toISOString();
    const testArray = [
      {
        originalQuery: `(myDate eq datetime'${newTimeStamp}'  )`,
        expectedQuery: `return ( ( new Date(item.properties.myDate).getTime() === new Date('${newTimeStamp}').getTime() ) )`
      },
      {
        originalQuery: `( datetime'${newTimeStamp}' eq myDate )`,
        expectedQuery: `return ( ( new Date('${newTimeStamp}').getTime() === new Date(item.properties.myDate).getTime() ) )`
      },
      {
        originalQuery: `PartitionKey eq 'partition1' and number gt 11 and Timestamp lt datetime'${newTimeStamp}'`,
        expectedQuery: `return ( item.properties.PartitionKey === \`partition1\` && item.properties.number > 11 && new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() )`
      },
      {
        originalQuery: `PartitionKey eq 'partition1' and number lt 11 and Timestamp lt datetime'${newTimeStamp}'`,
        expectedQuery: `return ( item.properties.PartitionKey === \`partition1\` && item.properties.number < 11 && new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() )`
      },
      {
        originalQuery: `(PartitionKey eq 'partition1') and (number lt 12) and (Timestamp lt datetime'${newTimeStamp}')`,
        expectedQuery: `return ( ( item.properties.PartitionKey === \`partition1\` ) && ( item.properties.number < 12 ) && ( new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() ) )`
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query with multiple predicates", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myInt eq 123 ) and (myString eq 'hello')",
        expectedQuery:
          "return ( ( item.properties.myInt === 123 ) && ( item.properties.myString === `hello` ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query with multiple predicates and no brackets", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "PartitionKey eq 'partitionKey' and int32Field eq 54321",
        expectedQuery:
          "return ( item.properties.PartitionKey === `partitionKey` && item.properties.int32Field === 54321 )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for a value of type binary", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: `(PartitionKey eq 'part1') and (binaryField eq binary'62696e61727944617461')`,
        expectedQuery:
          "return ( ( item.properties.PartitionKey === `part1` ) && ( item.properties.binaryField === 'YmluYXJ5RGF0YQ==' ) )"
      },
      {
        originalQuery: `(PartitionKey eq 'part1') and (binaryField eq X'62696e61727944617461')`,
        expectedQuery:
          "return ( ( item.properties.PartitionKey === `part1` ) && ( item.properties.binaryField === 'YmluYXJ5RGF0YQ==' ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a query for tables", async () => {
    // allow custom props = false!
    // system props : "name", "table"
    const testArray = [
      {
        originalQuery: "TableName ge 'myTable' and TableName lt 'myTable{'",
        expectedQuery:
          "return ( item.table >= `myTable` && item.table < `myTable{` )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createTableQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });

  it("correctly transcribes a very long query i.e. from Orleans", async () => {
    const testArray = [
      {
        originalQuery:
          "(PartitionKey eq '6e4ab0516fca4122bff05fb23a5f6adf') and (((RowKey eq 'user%2fsomeraondomuser_cf9e6f1fc7264c9c8148d6050e27ee3e') and (ActivationId eq '512b5a68bc1c46b480a1a052da681f45')) or ((RowKey eq 'user%2fsomeraondomuser_267f6d72c0874408a021043138c6e395') and (ActivationId eq 'e195014973754b11ae1b74cb4be9aab1')) or ((RowKey eq 'user%2fsomeraondomuser_34b4d10839ba48928a3ceee0ea6a1175') and (ActivationId eq '4573eccdaf8d42148907fd3b654b72c3')) or ((RowKey eq 'user%2fsomeraondomuser_931d172de3034561af4d210aa4007b8f') and (ActivationId eq 'd3e7ffeb439b4acf912006b2f01aa5a9')) or ((RowKey eq 'user%2fsomeraondomuser_6db90a01fab7429ca52698534629dd5d') and (ActivationId eq '492fe8afa0514a919fc0c491afc88e18')) or ((RowKey eq 'user%2fsomeraondomuser_b4710ac467ea46678d3b692d552b4573') and (ActivationId eq 'ed3a90e556474a4486196d7d20c7e0a8')) or ((RowKey eq 'user%2fsomeraondomuser_9a7d0ed9e934457790c4af955a5d0aa2') and (ActivationId eq 'e6098dd0457a438b8c8810381e72b103')) or ((RowKey eq 'user%2fsomeraondomuser_5f45717f56d14f6ebc1df2d3195609d8') and (ActivationId eq '1001b0b9b2224ab08c9b3e1413e733e3')) or ((RowKey eq 'user%2fsomeraondomuser_593e5eb5533f41998a6946d37748d1c4') and (ActivationId eq '100df8cda69a4101bd038f097073dcf0')) or ((RowKey eq 'user%2fsomeraondomuser_5c837b849f024914b694ebf978129210') and (ActivationId eq 'd4b38859695c4b31892053e2f8f16ce1')) or ((RowKey eq 'user%2fsomeraondomuser_0d59188361ed46b8967ff553fc31da22') and (ActivationId eq 'cc235fce46ca4dcf9c24a12eda86a23e')) or ((RowKey eq 'user%2fsomeraondomuser_46daebbc6d214de1b724a6d1bd909f2e') and (ActivationId eq 'f901237d1de5466bb350013841f7e1d9')) or ((RowKey eq 'user%2fsomeraondomuser_4bf3d38ef9664a17b8acbe6e6f4475e6') and (ActivationId eq '0d8b22f41df443f4956b4cef9ddccc7b')) or ((RowKey eq 'user%2fsomeraondomuser_7d157b7f3a3a4508a182b47394444a97') and (ActivationId eq '391cbd2712e94a10b1e8f7f5566ad1d1')) or ((RowKey eq 'user%2fsomeraondomuser_3173c9fea0124785a6dce8bb1ce22ff5') and (ActivationId eq '5926f7967953443089276d4011de4586')) or ((RowKey eq 'user%2fsomeraondomuser_855b9f1c9b1d4793b633dd312f97acee') and (ActivationId eq 'acbb6b581b604bd9bdb7d8109ad80c25')) or ((RowKey eq 'user%2fsomeraondomuser_0f11694546a049df89c234f5aca29594') and (ActivationId eq '83a8b6c565e74569a3d1f358ae1b4767')) or ((RowKey eq 'user%2fsomeraondomuser_5bd0f86dc2a74ba18848156fd4384fa0') and (ActivationId eq '430dcf95b539468cbfb99886949840b5')) or ((RowKey eq 'user%2fsomeraondomuser_85c207c588dd4c9697a921b29481152b') and (ActivationId eq 'e114211645144d8581b279cc8b780879')) or ((RowKey eq 'user%2fsomeraondomuser_d2d48e3e8e594b7ea755a6df291c55a4') and (ActivationId eq 'a9f50b02fa634628b56622602733d2df')) or ((RowKey eq 'user%2fsomeraondomuser_3f1c4bcf08c34efb8b64a40ee4e33698') and (ActivationId eq 'e7180ac71c6a4fb3b5e68c3a6d3c5ce6')) or ((RowKey eq 'user%2fsomeraondomuser_3871c563cd0e433fbb7d4ebbd6db4856') and (ActivationId eq 'c05eab92d0b44f4b8ea57b6cf9339cc2')) or ((RowKey eq 'user%2fsomeraondomuser_beb39451febe40aa9b51b051a5940b7c') and (ActivationId eq '51998e3e875c4c499f4ebb14bc9a91e6')) or ((RowKey eq 'user%2fsomeraondomuser_1258f93c3b054ee2b80a52f9f9bdc170') and (ActivationId eq 'cb3d1fd19e2d45eeb0ebd9a704e6d576')) or ((RowKey eq 'user%2fsomeraondomuser_b37d9915799047988a1b0598a47f7ba4') and (ActivationId eq '2560bf1bcde5461eb4899ef8ae009a7a')) or ((RowKey eq 'user%2fsomeraondomuser_37a27899265b4125ba98bc7fd2f9c000') and (ActivationId eq '166e0f18cd744666b3684c406493945e')) or ((RowKey eq 'user%2fsomeraondomuser_240b39fd90d94b54b0e923134b4cba55') and (ActivationId eq '329c6825c2754dd3b18411083b7b58e4')) or ((RowKey eq 'user%2fsomeraondomuser_e7c33f051c3c42a8883712e255635bbf') and (ActivationId eq 'f127763cb6374f49bf52b7876e594147')) or ((RowKey eq 'user%2fsomeraondomuser_3d5d8beeafac4b0aa6a146f7f2e5eadb') and (ActivationId eq '6f89c9bda1d74977997b1415db56a21e')) or ((RowKey eq 'user%2fsomeraondomuser_21d9c87ed89646e88be406cb57db4e1c') and (ActivationId eq '640d3e743baa4c969e4292aa80efbac2')) or ((RowKey eq 'user%2fsomeraondomuser_6d71d83c8083415a835943b18b9d6d99') and (ActivationId eq 'd4f8417dab4544ed972b288bae03efa3')) or ((RowKey eq 'user%2fsomeraondomuser_44253ea6cadc4165994fd4501998190b') and (ActivationId eq 'a099990633bb441a852ff00266c372ee')) or ((RowKey eq 'user%2fsomeraondomuser_169185ee08b446ee9a1dd329997f4b50') and (ActivationId eq '6928aeac8dfe4caeb44b275d3765bb9c')) or ((RowKey eq 'user%2fsomeraondomuser_5639229f610444df9ff2c3a598ba5ff3') and (ActivationId eq 'afd94604d549455983d4bb043b9bf4fc')) or ((RowKey eq 'user%2fsomeraondomuser_6e8177f40d924eecad86fe29cf042c5b') and (ActivationId eq 'ef6dff8131634580a05602b12b3c7030')) or ((RowKey eq 'user%2fsomeraondomuser_82c02c372d274b12b42eb613a94f0032') and (ActivationId eq 'c629d8827dec4946918fac970b0b01fc')) or ((RowKey eq 'user%2fsomeraondomuser_82d799f96a8341a888e823e7e6c680aa') and (ActivationId eq '6a430683a6864d518747c5613aae81f7')) or ((RowKey eq 'user%2fsomeraondomuser_eee54678565d4c62b3ee75ff595a639f') and (ActivationId eq '05b779023a86487291c54274f2351763')) or ((RowKey eq 'user%2fsomeraondomuser_d61b2e412be74d449cbe2e32c040b054') and (ActivationId eq 'abd89950074c455eabf0ce6507cff05b')) or ((RowKey eq 'user%2fsomeraondomuser_7d3b47e40a40403bac3c879f8ccc785a') and (ActivationId eq 'f37b30e2b99944ad8951924d890d6514')) or ((RowKey eq 'user%2fsomeraondomuser_fa9e78d2c68447928d3b5bcc7170f112') and (ActivationId eq 'bc9c4dde5ba443dea12137e5da919c41')) or ((RowKey eq 'user%2fsomeraondomuser_3bb66b8c2abb45c8b33e75ce4baa93ac') and (ActivationId eq '49c8905d49bc47bc9fea7d859c7812dd')) or ((RowKey eq 'user%2fsomeraondomuser_55b23534d04c4efe9d580c3740230486') and (ActivationId eq '1322e451d37145f4b1b41559f30b58e9')) or ((RowKey eq 'user%2fsomeraondomuser_8b8d04a70b8f43ab87d065e89d84aefb') and (ActivationId eq '3f7b8e9d039d4d788597d5fe7bb37666')) or ((RowKey eq 'user%2fsomeraondomuser_0d5ec8bb559d4e34a2d4c4b5d935386d') and (ActivationId eq '6eb87695c16f4289b48374a57fcc2bab')) or ((RowKey eq 'user%2fsomeraondomuser_a0ba488c7b0542d49cb2b406a7b3cca4') and (ActivationId eq 'fb20d88f4b6d4193aad4511c8951ef59')) or ((RowKey eq 'user%2fsomeraondomuser_25de238770ab41399d8cbe0343b9d0d3') and (ActivationId eq 'b587806d63324a4084cde9c92af04065')) or ((RowKey eq 'user%2fsomeraondomuser_7688796792e245d0913f050a3a7c6c02') and (ActivationId eq 'd95909aedd96417f945834151d397f51')) or ((RowKey eq 'user%2fsomeraondomuser_72967c3265ce4996b12001ea1814d62f') and (ActivationId eq 'd046ebb2304b4ff0be1c9d5a4c8a8831')) or ((RowKey eq 'user%2fsomeraondomuser_6238575aaee54a628caebb48b44584e5') and (ActivationId eq '6ac73966adb6496cb2a4553c7b9fe8ce')) or ((RowKey eq 'user%2fsomeraondomuser_fb89e80d21ed4b17a850f9021c4b1d2a') and (ActivationId eq '3833b18cabc344dab1dbdbb62c99accd')) or ((RowKey eq 'user%2fsomeraondomuser_f7aa848f4c7243b892fd979326884e3d') and (ActivationId eq '6911fe2a462e44aab8a143603e1af98f')) or ((RowKey eq 'user%2fsomeraondomuser_349234378ad34ec99c3ea00cb9149f80') and (ActivationId eq '62e351ea6ba44be8b45b2cb1a42efea3')) or ((RowKey eq 'user%2fsomeraondomuser_25707be4343f4f89955ea71bb2d75fe2') and (ActivationId eq '757fdf560e6e4fb0acc1d0578bc4bc83')) or ((RowKey eq 'user%2fsomeraondomuser_fdfe656c1e47438286a19ce4147201d1') and (ActivationId eq '5f417d1d6d9c498da973d30a26ac4c0f')) or ((RowKey eq 'user%2fsomeraondomuser_a4d0398c7b004774b638156dba8050b6') and (ActivationId eq '824bfc22f638402c99aa844984bc6814')) or ((RowKey eq 'user%2fsomeraondomuser_744afd919a134feb8167ea55d036a659') and (ActivationId eq 'b3cc18bb13254e95befa49486e7b7b9c')) or ((RowKey eq 'user%2fsomeraondomuser_6c8dbd201e6d4755a505586d669fb639') and (ActivationId eq 'e1aae7d578604f018c757fe76af995dd')) or ((RowKey eq 'user%2fsomeraondomuser_bcc2eecd8f6d4b53b22bc974e6ff5342') and (ActivationId eq '97916e010c614aa9873307d81cda8447')) or ((RowKey eq 'user%2fsomeraondomuser_be43c3586cf341318cee5941dab73f25') and (ActivationId eq 'a4cb2c286df54db89ddfa6a81ae7a4b8')) or ((RowKey eq 'user%2fsomeraondomuser_131c2342fa9f469ab2448122979901b2') and (ActivationId eq 'fb44869a714c49c6964ff7a14be19f77')) or ((RowKey eq 'user%2fsomeraondomuser_c01e6722572449bf9fd84be9911dd293') and (ActivationId eq 'cbfa2c14f69846ce9c3875b22652c5d9')) or ((RowKey eq 'user%2fsomeraondomuser_add4d77de01d455eaded6a1aa09185d2') and (ActivationId eq '6f9fa3a41f574fbebf7abcac08dd04b2')) or ((RowKey eq 'user%2fsomeraondomuser_ce38323206534df6a9764036fa08c6f9') and (ActivationId eq 'c0ec0e42e5fa4c03a5cb760d2c6323f5')) or ((RowKey eq 'user%2fsomeraondomuser_3f1d9bb315f84ef090977234ef50b78d') and (ActivationId eq '9314a7399ee24c039c05a1b242cd7dbd')) or ((RowKey eq 'user%2fsomeraondomuser_21cd31ddb97343d1b519799652af5a9a') and (ActivationId eq 'db93c80c878642f2974ca4589031c59c')) or ((RowKey eq 'user%2fsomeraondomuser_a53b1e377c774e539b9ee17e59d84028') and (ActivationId eq '12f4c570e1774c3f9cd5e9ba53ba24b0')) or ((RowKey eq 'user%2fsomeraondomuser_35629a332fb4418a8285c5a6e5ac1acb') and (ActivationId eq 'c6b4759436d9450aa5d6d06f0d493df3')) or ((RowKey eq 'user%2fsomeraondomuser_1fb4bd8083ed46c2a5a63acbba0f62f2') and (ActivationId eq '70b0af2656c04a7eb357556d5406bad1')) or ((RowKey eq 'user%2fsomeraondomuser_63968d03c6364bf281240cc5f66fa76d') and (ActivationId eq '2cc36dfd68a24892a3125ff93da1466c')) or ((RowKey eq 'user%2fsomeraondomuser_c1dac4848b6f42a2a49a5e74c8e23624') and (ActivationId eq 'bdd07a677e6841809f2580163d41f4cb')) or ((RowKey eq 'user%2fsomeraondomuser_e33ddf101a174c388a5f8b0b0aa589a5') and (ActivationId eq '71520233b5624b188e1f79b7acd64117')) or ((RowKey eq 'user%2fsomeraondomuser_1894548c3c164d88b28aa8ca81eec52e') and (ActivationId eq '4c5ffd05b895460695bb25e2f6445f80')) or ((RowKey eq 'user%2fsomeraondomuser_6072680f29f240cea960b4cb5d760a96') and (ActivationId eq 'a050286a236643bab071993b4816fe24')) or ((RowKey eq 'user%2fsomeraondomuser_530b499f40bc4d94830ac93e7cbf91c7') and (ActivationId eq '0b2848508785441aa8ac1b54ab74d37e')) or ((RowKey eq 'user%2fsomeraondomuser_fec06bded49c45629b38f019b2f2b1b5') and (ActivationId eq '963fb89616d6449fa26df30b0467fd3c')) or ((RowKey eq 'user%2fsomeraondomuser_f3163586cec543669edaa7a6b3dea09c') and (ActivationId eq '400088d1a343455ea5dbccd0e41aa143')) or ((RowKey eq 'user%2fsomeraondomuser_1d8cc8d9f1c149e4800b0982ca098cb4') and (ActivationId eq '1594d642ac864bebb1a24cec9e517fde')) or ((RowKey eq 'user%2fsomeraondomuser_cf63930ad32244e19795d6a36aab026b') and (ActivationId eq '7d79e95eea21479b84b294bb0163ed59')) or ((RowKey eq 'user%2fsomeraondomuser_f1a529712bc04e19b6a53b5900532059') and (ActivationId eq '53873144412d4846adff21d4efc3d83f')) or ((RowKey eq 'user%2fsomeraondomuser_ea51485ea2a145bd89a17c7584100c3a') and (ActivationId eq 'be0e6b64f793467691256ead12aa9232')) or ((RowKey eq 'user%2fsomeraondomuser_e007bb2d411f46dd90f0b1a426e66e93') and (ActivationId eq '1dd8fa52775748b385da70094b8b2094')) or ((RowKey eq 'user%2fsomeraondomuser_9ee4348df9c041ac9eace6ade2d76ecf') and (ActivationId eq '465722690f4f42df8cd602f7197d3be8')) or ((RowKey eq 'user%2fsomeraondomuser_b7307b3c66424fe3b1a7adb04e7477af') and (ActivationId eq '2956c4fbdda74079ba840a40f290cd7d')) or ((RowKey eq 'user%2fsomeraondomuser_92c5168aba054ba4bdf6d12fee1314f6') and (ActivationId eq 'ea1009a1d59d4550bbcb58978aef3cdd')) or ((RowKey eq 'user%2fsomeraondomuser_b454f3f44a0747f59a5b16bad9e468e1') and (ActivationId eq '6308e191701147e4a9a72bc3473fbdb2')) or ((RowKey eq 'user%2fsomeraondomuser_24af472a228f4c38b30b78c4ed9076f8') and (ActivationId eq '3e518a0f7a0f49149422f65c7043caa3')) or ((RowKey eq 'user%2fsomeraondomuser_574ddad0703a4b5d96d9231ab0e42fc7') and (ActivationId eq 'eb2baddcdc334ac3b5d4497b4adbd6a4')) or ((RowKey eq 'user%2fsomeraondomuser_3c772b3dfbab4de09523fd1805cc5ba2') and (ActivationId eq 'c64844c4eee14533b5d5319c25190908')) or ((RowKey eq 'user%2fsomeraondomuser_527e8e5da4d9469f9487af8e2566366d') and (ActivationId eq '461322a278544e90a0df05efdd840c46')) or ((RowKey eq 'user%2fsomeraondomuser_ef61d4ecc9544f5da29145c6f8bcfa9d') and (ActivationId eq '20f8029af34a4c3eaf24df390e89f427')) or ((RowKey eq 'user%2fsomeraondomuser_8678a87f705e41aba41c3925220f23fe') and (ActivationId eq '6cb3b765a2dd48958ef0537826804b4b')) or ((RowKey eq 'user%2fsomeraondomuser_d271d9a5cb354e0691dacaebdb9281f3') and (ActivationId eq '66ac01d677c34f9cae99dfb4cdaa00e5')) or ((RowKey eq 'user%2fsomeraondomuser_5d982fbac181413295310c6c8fc93c5f') and (ActivationId eq 'd94b900aec6249ee9e1856e3805b091b')) or ((RowKey eq 'user%2fsomeraondomuser_81b88cb28e69458d9b80067476f7c1af') and (ActivationId eq '2c53f55e7203418b91a360bdb28e5028')) or ((RowKey eq 'user%2fsomeraondomuser_a7ac9f7d851840579b8db4bf8ac61a7b') and (ActivationId eq '3c55ef4b112b4e4fbefd1df5ea871018')) or ((RowKey eq 'user%2fsomeraondomuser_3c100e76c2f14dcf97146a67a835c702') and (ActivationId eq '4e03bb4eb4364e6fa88f736b561eae82')) or ((RowKey eq 'user%2fsomeraondomuser_ff86a95db64f492d8c23296215ba1d54') and (ActivationId eq '4e29d0707ccb42e3b5b054eec8c040e4')) or ((RowKey eq 'user%2fsomeraondomuser_f443ac2a7bc9433bad7ec2b1c4228ef7') and (ActivationId eq 'b03811e7f6e94158a75912e71edffa06')) or ((RowKey eq 'user%2fsomeraondomuser_9baa6c0b81d34a6d8c9cef39d9a5f4e6') and (ActivationId eq '71cb5917ddf34a5baaf0f78810910a95')))",
        expectedQuery:
          "return ( ( item.properties.PartitionKey === `6e4ab0516fca4122bff05fb23a5f6adf` ) && ( ( ( item.properties.RowKey === `user%2fsomeraondomuser_cf9e6f1fc7264c9c8148d6050e27ee3e` ) && ( item.properties.ActivationId === `512b5a68bc1c46b480a1a052da681f45` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_267f6d72c0874408a021043138c6e395` ) && ( item.properties.ActivationId === `e195014973754b11ae1b74cb4be9aab1` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_34b4d10839ba48928a3ceee0ea6a1175` ) && ( item.properties.ActivationId === `4573eccdaf8d42148907fd3b654b72c3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_931d172de3034561af4d210aa4007b8f` ) && ( item.properties.ActivationId === `d3e7ffeb439b4acf912006b2f01aa5a9` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6db90a01fab7429ca52698534629dd5d` ) && ( item.properties.ActivationId === `492fe8afa0514a919fc0c491afc88e18` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_b4710ac467ea46678d3b692d552b4573` ) && ( item.properties.ActivationId === `ed3a90e556474a4486196d7d20c7e0a8` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_9a7d0ed9e934457790c4af955a5d0aa2` ) && ( item.properties.ActivationId === `e6098dd0457a438b8c8810381e72b103` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_5f45717f56d14f6ebc1df2d3195609d8` ) && ( item.properties.ActivationId === `1001b0b9b2224ab08c9b3e1413e733e3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_593e5eb5533f41998a6946d37748d1c4` ) && ( item.properties.ActivationId === `100df8cda69a4101bd038f097073dcf0` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_5c837b849f024914b694ebf978129210` ) && ( item.properties.ActivationId === `d4b38859695c4b31892053e2f8f16ce1` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_0d59188361ed46b8967ff553fc31da22` ) && ( item.properties.ActivationId === `cc235fce46ca4dcf9c24a12eda86a23e` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_46daebbc6d214de1b724a6d1bd909f2e` ) && ( item.properties.ActivationId === `f901237d1de5466bb350013841f7e1d9` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_4bf3d38ef9664a17b8acbe6e6f4475e6` ) && ( item.properties.ActivationId === `0d8b22f41df443f4956b4cef9ddccc7b` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_7d157b7f3a3a4508a182b47394444a97` ) && ( item.properties.ActivationId === `391cbd2712e94a10b1e8f7f5566ad1d1` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3173c9fea0124785a6dce8bb1ce22ff5` ) && ( item.properties.ActivationId === `5926f7967953443089276d4011de4586` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_855b9f1c9b1d4793b633dd312f97acee` ) && ( item.properties.ActivationId === `acbb6b581b604bd9bdb7d8109ad80c25` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_0f11694546a049df89c234f5aca29594` ) && ( item.properties.ActivationId === `83a8b6c565e74569a3d1f358ae1b4767` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_5bd0f86dc2a74ba18848156fd4384fa0` ) && ( item.properties.ActivationId === `430dcf95b539468cbfb99886949840b5` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_85c207c588dd4c9697a921b29481152b` ) && ( item.properties.ActivationId === `e114211645144d8581b279cc8b780879` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_d2d48e3e8e594b7ea755a6df291c55a4` ) && ( item.properties.ActivationId === `a9f50b02fa634628b56622602733d2df` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3f1c4bcf08c34efb8b64a40ee4e33698` ) && ( item.properties.ActivationId === `e7180ac71c6a4fb3b5e68c3a6d3c5ce6` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3871c563cd0e433fbb7d4ebbd6db4856` ) && ( item.properties.ActivationId === `c05eab92d0b44f4b8ea57b6cf9339cc2` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_beb39451febe40aa9b51b051a5940b7c` ) && ( item.properties.ActivationId === `51998e3e875c4c499f4ebb14bc9a91e6` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_1258f93c3b054ee2b80a52f9f9bdc170` ) && ( item.properties.ActivationId === `cb3d1fd19e2d45eeb0ebd9a704e6d576` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_b37d9915799047988a1b0598a47f7ba4` ) && ( item.properties.ActivationId === `2560bf1bcde5461eb4899ef8ae009a7a` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_37a27899265b4125ba98bc7fd2f9c000` ) && ( item.properties.ActivationId === `166e0f18cd744666b3684c406493945e` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_240b39fd90d94b54b0e923134b4cba55` ) && ( item.properties.ActivationId === `329c6825c2754dd3b18411083b7b58e4` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_e7c33f051c3c42a8883712e255635bbf` ) && ( item.properties.ActivationId === `f127763cb6374f49bf52b7876e594147` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3d5d8beeafac4b0aa6a146f7f2e5eadb` ) && ( item.properties.ActivationId === `6f89c9bda1d74977997b1415db56a21e` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_21d9c87ed89646e88be406cb57db4e1c` ) && ( item.properties.ActivationId === `640d3e743baa4c969e4292aa80efbac2` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6d71d83c8083415a835943b18b9d6d99` ) && ( item.properties.ActivationId === `d4f8417dab4544ed972b288bae03efa3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_44253ea6cadc4165994fd4501998190b` ) && ( item.properties.ActivationId === `a099990633bb441a852ff00266c372ee` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_169185ee08b446ee9a1dd329997f4b50` ) && ( item.properties.ActivationId === `6928aeac8dfe4caeb44b275d3765bb9c` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_5639229f610444df9ff2c3a598ba5ff3` ) && ( item.properties.ActivationId === `afd94604d549455983d4bb043b9bf4fc` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6e8177f40d924eecad86fe29cf042c5b` ) && ( item.properties.ActivationId === `ef6dff8131634580a05602b12b3c7030` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_82c02c372d274b12b42eb613a94f0032` ) && ( item.properties.ActivationId === `c629d8827dec4946918fac970b0b01fc` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_82d799f96a8341a888e823e7e6c680aa` ) && ( item.properties.ActivationId === `6a430683a6864d518747c5613aae81f7` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_eee54678565d4c62b3ee75ff595a639f` ) && ( item.properties.ActivationId === `05b779023a86487291c54274f2351763` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_d61b2e412be74d449cbe2e32c040b054` ) && ( item.properties.ActivationId === `abd89950074c455eabf0ce6507cff05b` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_7d3b47e40a40403bac3c879f8ccc785a` ) && ( item.properties.ActivationId === `f37b30e2b99944ad8951924d890d6514` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_fa9e78d2c68447928d3b5bcc7170f112` ) && ( item.properties.ActivationId === `bc9c4dde5ba443dea12137e5da919c41` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3bb66b8c2abb45c8b33e75ce4baa93ac` ) && ( item.properties.ActivationId === `49c8905d49bc47bc9fea7d859c7812dd` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_55b23534d04c4efe9d580c3740230486` ) && ( item.properties.ActivationId === `1322e451d37145f4b1b41559f30b58e9` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_8b8d04a70b8f43ab87d065e89d84aefb` ) && ( item.properties.ActivationId === `3f7b8e9d039d4d788597d5fe7bb37666` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_0d5ec8bb559d4e34a2d4c4b5d935386d` ) && ( item.properties.ActivationId === `6eb87695c16f4289b48374a57fcc2bab` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_a0ba488c7b0542d49cb2b406a7b3cca4` ) && ( item.properties.ActivationId === `fb20d88f4b6d4193aad4511c8951ef59` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_25de238770ab41399d8cbe0343b9d0d3` ) && ( item.properties.ActivationId === `b587806d63324a4084cde9c92af04065` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_7688796792e245d0913f050a3a7c6c02` ) && ( item.properties.ActivationId === `d95909aedd96417f945834151d397f51` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_72967c3265ce4996b12001ea1814d62f` ) && ( item.properties.ActivationId === `d046ebb2304b4ff0be1c9d5a4c8a8831` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6238575aaee54a628caebb48b44584e5` ) && ( item.properties.ActivationId === `6ac73966adb6496cb2a4553c7b9fe8ce` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_fb89e80d21ed4b17a850f9021c4b1d2a` ) && ( item.properties.ActivationId === `3833b18cabc344dab1dbdbb62c99accd` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_f7aa848f4c7243b892fd979326884e3d` ) && ( item.properties.ActivationId === `6911fe2a462e44aab8a143603e1af98f` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_349234378ad34ec99c3ea00cb9149f80` ) && ( item.properties.ActivationId === `62e351ea6ba44be8b45b2cb1a42efea3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_25707be4343f4f89955ea71bb2d75fe2` ) && ( item.properties.ActivationId === `757fdf560e6e4fb0acc1d0578bc4bc83` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_fdfe656c1e47438286a19ce4147201d1` ) && ( item.properties.ActivationId === `5f417d1d6d9c498da973d30a26ac4c0f` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_a4d0398c7b004774b638156dba8050b6` ) && ( item.properties.ActivationId === `824bfc22f638402c99aa844984bc6814` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_744afd919a134feb8167ea55d036a659` ) && ( item.properties.ActivationId === `b3cc18bb13254e95befa49486e7b7b9c` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6c8dbd201e6d4755a505586d669fb639` ) && ( item.properties.ActivationId === `e1aae7d578604f018c757fe76af995dd` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_bcc2eecd8f6d4b53b22bc974e6ff5342` ) && ( item.properties.ActivationId === `97916e010c614aa9873307d81cda8447` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_be43c3586cf341318cee5941dab73f25` ) && ( item.properties.ActivationId === `a4cb2c286df54db89ddfa6a81ae7a4b8` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_131c2342fa9f469ab2448122979901b2` ) && ( item.properties.ActivationId === `fb44869a714c49c6964ff7a14be19f77` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_c01e6722572449bf9fd84be9911dd293` ) && ( item.properties.ActivationId === `cbfa2c14f69846ce9c3875b22652c5d9` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_add4d77de01d455eaded6a1aa09185d2` ) && ( item.properties.ActivationId === `6f9fa3a41f574fbebf7abcac08dd04b2` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_ce38323206534df6a9764036fa08c6f9` ) && ( item.properties.ActivationId === `c0ec0e42e5fa4c03a5cb760d2c6323f5` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3f1d9bb315f84ef090977234ef50b78d` ) && ( item.properties.ActivationId === `9314a7399ee24c039c05a1b242cd7dbd` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_21cd31ddb97343d1b519799652af5a9a` ) && ( item.properties.ActivationId === `db93c80c878642f2974ca4589031c59c` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_a53b1e377c774e539b9ee17e59d84028` ) && ( item.properties.ActivationId === `12f4c570e1774c3f9cd5e9ba53ba24b0` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_35629a332fb4418a8285c5a6e5ac1acb` ) && ( item.properties.ActivationId === `c6b4759436d9450aa5d6d06f0d493df3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_1fb4bd8083ed46c2a5a63acbba0f62f2` ) && ( item.properties.ActivationId === `70b0af2656c04a7eb357556d5406bad1` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_63968d03c6364bf281240cc5f66fa76d` ) && ( item.properties.ActivationId === `2cc36dfd68a24892a3125ff93da1466c` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_c1dac4848b6f42a2a49a5e74c8e23624` ) && ( item.properties.ActivationId === `bdd07a677e6841809f2580163d41f4cb` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_e33ddf101a174c388a5f8b0b0aa589a5` ) && ( item.properties.ActivationId === `71520233b5624b188e1f79b7acd64117` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_1894548c3c164d88b28aa8ca81eec52e` ) && ( item.properties.ActivationId === `4c5ffd05b895460695bb25e2f6445f80` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_6072680f29f240cea960b4cb5d760a96` ) && ( item.properties.ActivationId === `a050286a236643bab071993b4816fe24` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_530b499f40bc4d94830ac93e7cbf91c7` ) && ( item.properties.ActivationId === `0b2848508785441aa8ac1b54ab74d37e` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_fec06bded49c45629b38f019b2f2b1b5` ) && ( item.properties.ActivationId === `963fb89616d6449fa26df30b0467fd3c` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_f3163586cec543669edaa7a6b3dea09c` ) && ( item.properties.ActivationId === `400088d1a343455ea5dbccd0e41aa143` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_1d8cc8d9f1c149e4800b0982ca098cb4` ) && ( item.properties.ActivationId === `1594d642ac864bebb1a24cec9e517fde` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_cf63930ad32244e19795d6a36aab026b` ) && ( item.properties.ActivationId === `7d79e95eea21479b84b294bb0163ed59` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_f1a529712bc04e19b6a53b5900532059` ) && ( item.properties.ActivationId === `53873144412d4846adff21d4efc3d83f` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_ea51485ea2a145bd89a17c7584100c3a` ) && ( item.properties.ActivationId === `be0e6b64f793467691256ead12aa9232` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_e007bb2d411f46dd90f0b1a426e66e93` ) && ( item.properties.ActivationId === `1dd8fa52775748b385da70094b8b2094` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_9ee4348df9c041ac9eace6ade2d76ecf` ) && ( item.properties.ActivationId === `465722690f4f42df8cd602f7197d3be8` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_b7307b3c66424fe3b1a7adb04e7477af` ) && ( item.properties.ActivationId === `2956c4fbdda74079ba840a40f290cd7d` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_92c5168aba054ba4bdf6d12fee1314f6` ) && ( item.properties.ActivationId === `ea1009a1d59d4550bbcb58978aef3cdd` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_b454f3f44a0747f59a5b16bad9e468e1` ) && ( item.properties.ActivationId === `6308e191701147e4a9a72bc3473fbdb2` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_24af472a228f4c38b30b78c4ed9076f8` ) && ( item.properties.ActivationId === `3e518a0f7a0f49149422f65c7043caa3` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_574ddad0703a4b5d96d9231ab0e42fc7` ) && ( item.properties.ActivationId === `eb2baddcdc334ac3b5d4497b4adbd6a4` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3c772b3dfbab4de09523fd1805cc5ba2` ) && ( item.properties.ActivationId === `c64844c4eee14533b5d5319c25190908` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_527e8e5da4d9469f9487af8e2566366d` ) && ( item.properties.ActivationId === `461322a278544e90a0df05efdd840c46` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_ef61d4ecc9544f5da29145c6f8bcfa9d` ) && ( item.properties.ActivationId === `20f8029af34a4c3eaf24df390e89f427` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_8678a87f705e41aba41c3925220f23fe` ) && ( item.properties.ActivationId === `6cb3b765a2dd48958ef0537826804b4b` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_d271d9a5cb354e0691dacaebdb9281f3` ) && ( item.properties.ActivationId === `66ac01d677c34f9cae99dfb4cdaa00e5` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_5d982fbac181413295310c6c8fc93c5f` ) && ( item.properties.ActivationId === `d94b900aec6249ee9e1856e3805b091b` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_81b88cb28e69458d9b80067476f7c1af` ) && ( item.properties.ActivationId === `2c53f55e7203418b91a360bdb28e5028` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_a7ac9f7d851840579b8db4bf8ac61a7b` ) && ( item.properties.ActivationId === `3c55ef4b112b4e4fbefd1df5ea871018` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_3c100e76c2f14dcf97146a67a835c702` ) && ( item.properties.ActivationId === `4e03bb4eb4364e6fa88f736b561eae82` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_ff86a95db64f492d8c23296215ba1d54` ) && ( item.properties.ActivationId === `4e29d0707ccb42e3b5b054eec8c040e4` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_f443ac2a7bc9433bad7ec2b1c4228ef7` ) && ( item.properties.ActivationId === `b03811e7f6e94158a75912e71edffa06` ) ) || ( ( item.properties.RowKey === `user%2fsomeraondomuser_9baa6c0b81d34a6d8c9cef39d9a5f4e6` ) && ( item.properties.ActivationId === `71cb5917ddf34a5baaf0f78810910a95` ) ) ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createTableQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.transcribe();
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }
  });
});
