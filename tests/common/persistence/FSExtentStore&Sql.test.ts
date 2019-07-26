import * as assert from "assert";
import { randomBytes } from "crypto";

import { configLogger } from "../../../src/common/Logger";
import FSExtentStore from "../../../src/common/persistence/FSExtentStore";
import IExtentMetadataStore from "../../../src/common/persistence/IExtentMetadataStore";
import IExtentStore, {
  StoreDestinationArray
} from "../../../src/common/persistence/IExtentStore";
import SqlExtentMetadataStore from "../../../src/common/persistence/SqlExtentMetadataStore";
import { readStreamToString, rmRecursive } from "../../testutils";

const DB_URI =
  "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_extent_metadata";

configLogger(false);

describe("FSExtentTest", () => {
  let store: IExtentStore;
  let metaDatastore: IExtentMetadataStore;
  const persistenceArray: StoreDestinationArray = [
    {
      persistenceId: "FSExtentTest",
      persistencePath: "FSExtentTest",
      maxConcurrency: 10
    }
  ];

  before(async () => {
    metaDatastore = new SqlExtentMetadataStore(DB_URI, {
      logging: false,
      pool: {
        max: 100,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        timezone: "Etc/GMT-0"
      }
    });

    store = new FSExtentStore(metaDatastore, persistenceArray);

    await store.init();
  });

  after(async () => {
    await store.close();
    for (const persistence of persistenceArray) {
      await rmRecursive(persistence.persistencePath);
    }
  });

  it("Write a new extent and read it.", async () => {
    const text = "hello,你好啊~$￥";
    const extent = await store.appendExtent(Buffer.from(text));

    const rs = await store.readExtent(extent);
    const readText = await readStreamToString(rs);
    assert.ok(text === readText);
  });

  it("Write and append an extent.", async () => {
    const text1 = "hello,你好啊~$￥";
    const extent1 = await store.appendExtent(Buffer.from(text1));

    const text2 = "hi,我很好。";
    const extent2 = await store.appendExtent(Buffer.from(text2));

    let rs = await store.readExtent(extent1);
    const readText1 = await readStreamToString(rs);
    rs = await store.readExtent(extent2);
    const readText2 = await readStreamToString(rs);
    assert.ok(text1 === readText1 && text2 === readText2);
  });

  it("Simultaneously append 1000 random texts, then read all texts.", async () => {
    const count = 1000;
    let appendArray: Promise<any>[] = [];
    let texts: string[] = [];
    for (var i = 0; i < count; i++) {
      let len = Math.floor(Math.random() * 1024 * 64 + 1);
      texts.push(randomBytes(len / 2).toString("hex"));
      appendArray.push(store.appendExtent(Buffer.from(texts[i])));
    }
    const result = await Promise.all(appendArray);

    const readArray: Promise<any>[] = [];
    for (var i = 0; i < count; i++) {
      //console.log(result[i]);
      readArray.push(
        new Promise<any>(resolve => {
          store.readExtent(result[i]).then(rs => {
            resolve(readStreamToString(rs));
          });
        })
      );
    }

    const readTexts = await Promise.all(readArray);

    assert.deepStrictEqual(texts, readTexts);
  });
});
