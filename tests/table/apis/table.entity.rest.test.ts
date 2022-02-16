// Tests in this file are using raw rest requests,
// as this enables us to test calls which are otherwise not possible
// using the SDKs, can be used as a test rig for repros which provide a debug log.
// later we can automate the parsing of repro logs to automatically play these into the tester
// special care is needed to replace etags and folders when used

import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  getToAzurite,
  postToAzurite
} from "../utils/table.entity.tests.rest.submitter";

// Set true to enable debug log
configLogger(false);

describe("table Entity APIs test", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__tableTestsStorage__";
  const enableDebugLog: boolean = true;
  const debugLogPath: string = "g:/debug.log";
  const config = new TableConfiguration(
    host,
    port,
    metadataDbPath,
    enableDebugLog,
    false,
    undefined,
    debugLogPath,
    false,
    true
  );

  let server: TableServer;

  let reproFlowsTableName: string = getUniqueName("flows");

  before(async () => {
    server = new TableServer(config);
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    // in order to run tests without cleaning up, I am replacing the table name with a unique name each time
    reproFlowsTableName = getUniqueName("flows");
  });

  // https://github.com/Azure/Azurite/issues/754
  it("Should be able to create a table using axios rest client and await, @loki", async () => {
    // first create the table for these tests
    const body = JSON.stringify({
      TableName: reproFlowsTableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    const createTableResult = await postToAzurite(
      "Tables",
      body,
      createTableHeaders
    );
    assert.strictEqual(createTableResult.status, 201);

    // prettier-ignore
    const batchRequest1RawRequestString: string = `--batch_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7\r\nContent-Type: multipart/mixed; boundary=changeset_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7\r\n\r\n--changeset_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPOST http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName} HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nPrefer: return-no-content\r\n\r\n{\"PartitionKey\":\"09CEE\",\"RowKey\":\"EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A\",\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:46.5446473Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:46.5535366Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"127b472c-6db3-4de7-bdb7-4947314e77c0\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786989753914\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:46.5430732Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPOST http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName} HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nPrefer: return-no-content\r\n\r\n{\"PartitionKey\":\"09CEE\",\"RowKey\":\"EA5F528CF1B84658A5CECC574848547B_FLOWVERSION-5539F65E020B44FCA32CF9CBE56E286A-08585830786989753914\",\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:46.5446473Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:46.5535366Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"127b472c-6db3-4de7-bdb7-4947314e77c0\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786989753914\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:46.5430732Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPOST http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName} HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nPrefer: return-no-content\r\n\r\n{\"PartitionKey\":\"09CEE\",\"RowKey\":\"EA5F528CF1B84658A5CECC574848547B_FLOWLOOKUP-DE415C09:2D29BB:2D483D:2D9544:2D25602C1FF355-TESTFLOW1\",\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:46.5446473Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:46.5535366Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"127b472c-6db3-4de7-bdb7-4947314e77c0\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786989753914\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:46.5430732Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7--\r\n--batch_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7--\r\n`;
    const batchRequest1Headers = {
      "user-agent": "ResourceStack/6.0.0.1260",
      "x-ms-version": "2018-03-28",
      "x-ms-client-request-id": "127b472c-6db3-4de7-bdb7-4947314e77c0",
      accept: "application/json;odata=nometadata",
      "content-type":
        "multipart/mixed; boundary=batch_4689afd3-e4e1-4966-9aeb-2bdb8d16cba7"
    };
    const request1Result = await postToAzurite(
      "$batch",
      batchRequest1RawRequestString,
      batchRequest1Headers
    );
    // we submitted the batch OK
    assert.strictEqual(request1Result.status, 202);

    const request2Result = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "7bbeb6b2-a1c7-4fed-8a3c-80f6b3e7db8c",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(request2Result.status, 200);

    const request3Result = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "41eb727e-1f85-4f53-b4e1-2df2628b2903",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(request3Result.status, 200);

    // prettier-ignore
    const batchRequest2RawRequestString: string = `--batch_3e8c6583-146e-4326-835f-5f7321fc6711\r\nContent-Type: multipart/mixed; boundary=changeset_3e8c6583-146e-4326-835f-5f7321fc6711\r\n\r\n--changeset_3e8c6583-146e-4326-835f-5f7321fc6711\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPOST http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName} HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nPrefer: return-no-content\r\n\r\n{\"PartitionKey\":\"09CEE\",\"RowKey\":\"EA5F528CF1B84658A5CECC574848547B_FLOWVERSION-5539F65E020B44FCA32CF9CBE56E286A-08585830786980800821\",\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:47.4209193Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:47.4214726Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"f2503371-15c7-4314-9803-81ea69f1ca72\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786980800821\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:47.4101988Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_3e8c6583-146e-4326-835f-5f7321fc6711\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPUT http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A') HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nIf-Match: W/\"datetime'2021-04-15T23%3A09%3A46.5910000Z'\"\r\n\r\n{\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:46.5446473Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:47.4214726Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"f2503371-15c7-4314-9803-81ea69f1ca72\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786980800821\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:47.4101988Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_3e8c6583-146e-4326-835f-5f7321fc6711\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPUT http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWLOOKUP-DE415C09%3A2D29BB%3A2D483D%3A2D9544%3A2D25602C1FF355-TESTFLOW1') HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nIf-Match: W/\"datetime'2021-04-15T23%3A09%3A46.5910000Z'\"\r\n\r\n{\"Sku\":\"{\\\"name\\\":\\\"Standard\\\",\\\"plan\\\":{\\\"name\\\":\\\"farm0\\\",\\\"id\\\":\\\"/subscriptions/ea5f528c-f1b8-4658-a5ce-cc574848547b/resourcegroups/rgname/providers/microsoft.web/serverfarms/farm0\\\",\\\"type\\\":\\\"Microsoft.Web/ServerFarms\\\"}}\",\"State\":\"Enabled\",\"CreatedTime\":\"2021-04-15T23:09:46.5446473Z\",\"CreatedTime@odata.type\":\"Edm.DateTime\",\"ChangedTime\":\"2021-04-15T23:09:47.4214726Z\",\"ChangedTime@odata.type\":\"Edm.DateTime\",\"DeletedTime\":\"1970-01-01T00:00:00Z\",\"DeletedTime@odata.type\":\"Edm.DateTime\",\"ChangedOperationId\":\"f2503371-15c7-4314-9803-81ea69f1ca72\",\"FlowId\":\"5539f65e020b44fca32cf9cbe56e286a\",\"SubscriptionId\":\"ea5f528c-f1b8-4658-a5ce-cc574848547b\",\"ResourceGroupName\":\"de415c09-29bb-483d-9544-25602c1ff355\",\"FlowName\":\"testflow1\",\"FlowSequenceId\":\"08585830786980800821\",\"ScaleUnit\":\"CU03\",\"Location\":\"devfabric\",\"RuntimeConfiguration\":\"{}\",\"DefinitionCompressed\":\"jwcotS/9AEgVAwCiRhYYkLcNkP8mJJYMoNGjbJnZPa29JAj6mJmxrTE9/2R9ohB1/NkjGtPz5ue0veuIO/Bh4F5oChYGDVOK3MToeBoFf7AtSEKrwCZGxxFRXsjU9Y9ObxOj44BjAQEAHmQzCg==\",\"DefinitionCompressed@odata.type\":\"Edm.Binary\",\"Metadata\":\"F3t9\",\"Metadata@odata.type\":\"Edm.Binary\",\"ParametersCompressed\":\"F3t9\",\"ParametersCompressed@odata.type\":\"Edm.Binary\",\"ConnectionReferences\":\"F3t9\",\"ConnectionReferences@odata.type\":\"Edm.Binary\",\"WorkflowReferences\":\"F3t9\",\"WorkflowReferences@odata.type\":\"Edm.Binary\",\"KeyVaultCertificateReferences\":\"F3t9\",\"KeyVaultCertificateReferences@odata.type\":\"Edm.Binary\",\"RuntimeContext\":\"9wwotS/9AEjlAwByiBkYkMU5BL8arW5Jf8FNkkBfmOlff9ZsdxcWrTF0mx+8MGnqWiyshMHAwMidxtAJrOk2bmWAjRV8Ta7rVnzgkVCFZ7LZJJFlmzuNoTuuSiEhqMI7jaHb/GBF15nC6V6cLr66kv9NxwIGAL9DUfY8vlXeBHXArwqTKlQZ\",\"RuntimeContext@odata.type\":\"Edm.Binary\",\"FlowUpdatedTime\":\"2021-04-15T23:09:47.4101988Z\",\"FlowUpdatedTime@odata.type\":\"Edm.DateTime\"}\r\n--changeset_3e8c6583-146e-4326-835f-5f7321fc6711--\r\n--batch_3e8c6583-146e-4326-835f-5f7321fc6711--\r\n`;

    const request4Result = await postToAzurite(
      `$batch`,
      batchRequest2RawRequestString,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "f2503371-15c7-4314-9803-81ea69f1ca72",
        accept: "application/json;odata=nometadata",
        "content-type":
          "multipart/mixed; boundary=batch_3e8c6583-146e-4326-835f-5f7321fc6711"
      }
    );
    // we submitted the batch OK
    assert.strictEqual(request4Result.status, 202);

    const request5Result = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "ceceedd3-4d7c-450f-a738-b83b21788d42",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(request5Result.status, 200);

    const request6Result = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "ceceedd3-4d7c-450f-a738-b83b21788d42",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(request6Result.status, 200);
    const result6Data: any = request6Result.data;
    // prettier-ignore
    const flowEtag: string = result6Data["odata.etag"];

    // we need to look up EA5F528CF1B84658A5CECC574848547B_FLOWLOOKUP-DE415C09%3A2D29BB%3A2D483D%3A2D9544%3A2D25602C1FF355-TESTFLOW1
    // as this etag is also used with the delete in the failing batch request
    const requestTestFlowResult = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWLOOKUP-DE415C09%3A2D29BB%3A2D483D%3A2D9544%3A2D25602C1FF355-TESTFLOW1')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "00000000-4d7c-450f-a738-b83b21788d42",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(requestTestFlowResult.status, 200);
    const resultTestFlowData: any = request6Result.data;
    // prettier-ignore
    const testFlowEtag: string = resultTestFlowData["odata.etag"];

    // validate the etag that we are using to delete the flow
    const validateEtagResult = await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "00000001-4d7c-450f-a738-b83b21788d42",
        accept: "application/json;odata=minimalmetadata"
      }
    );
    assert.strictEqual(request6Result.status, 200);
    const validateEtagResultData: any = validateEtagResult.data;
    // prettier-ignore
    const flowEtagValid: string = validateEtagResultData["odata.etag"];

    assert.strictEqual(
      flowEtag,
      flowEtagValid,
      "The Etag from the batch request and the etag we have in storage do not match!"
    );

    // we need to replace the if-match / etag with the one from request6
    // prettier-ignore
    const batchRequest3RawRequestString: string = `--batch_558d985f-491c-496d-b4a2-311c3e1e075d\r\nContent-Type: multipart/mixed; boundary=changeset_558d985f-491c-496d-b4a2-311c3e1e075d\r\n\r\n--changeset_558d985f-491c-496d-b4a2-311c3e1e075d\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nDELETE http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A') HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nIf-Match: ${flowEtag}\r\n\r\n--changeset_558d985f-491c-496d-b4a2-311c3e1e075d\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nDELETE http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWLOOKUP-DE415C09%3A2D29BB%3A2D483D%3A2D9544%3A2D25602C1FF355-TESTFLOW1') HTTP/1.1\r\nAccept: application/json;odata=nometadata\r\nContent-Type: application/json\r\nIf-Match: ${testFlowEtag}\r\n\r\n--changeset_558d985f-491c-496d-b4a2-311c3e1e075d--\r\n--batch_558d985f-491c-496d-b4a2-311c3e1e075d--\r\n`;

    const request7Result = await postToAzurite(
      `$batch`,
      batchRequest3RawRequestString,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "41aef06f-9443-497e-b192-216ae988549b",
        "content-type":
          "multipart/mixed; boundary=batch_558d985f-491c-496d-b4a2-311c3e1e075d",
        accept: "application/json;odata=nometadata"
      }
    );
    // we submitted the batch OK
    // current repro fails with precondition failed
    assert.strictEqual(request7Result.status, 202);

    // validate the object was deleted!
    await getToAzurite(
      `${reproFlowsTableName}(PartitionKey='09CEE',RowKey='EA5F528CF1B84658A5CECC574848547B_FLOWIDENTIFIER-5539F65E020B44FCA32CF9CBE56E286A')`,
      {
        "user-agent": "ResourceStack/6.0.0.1260",
        "x-ms-version": "2018-03-28",
        "x-ms-client-request-id": "00000002-4d7c-450f-a738-b83b21788d42",
        accept: "application/json;odata=minimalmetadata"
      }
    ).catch((getErr) => {
      assert.strictEqual(getErr.response.status, 404);
    });
  });

  it("Should be able to use patch verb in a batch request, @loki", async () => {
    const body = JSON.stringify({
      TableName: reproFlowsTableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    const createTableResult = await postToAzurite(
      "Tables",
      body,
      createTableHeaders
    );
    assert.strictEqual(createTableResult.status, 201);

    const batchWithPatchRequestString = `--batch_a10acba3-03e0-4200-b4da-a0cd4f0017f6\r\nContent-Type: multipart/mixed; boundary=changeset_0d221006-845a-4c28-a176-dfc18410d0e4\r\n\r\n--changeset_0d221006-845a-4c28-a176-dfc18410d0e4\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nPATCH http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey=\'ad922e14-b371-4631-81ab-9e14e9c0e9ea\',RowKey=\'a\')?$format=application%2Fjson%3Bodata%3Dminimalmetadata HTTP/1.1\r\nHost: 127.0.0.1\r\nx-ms-version: 2019-02-02\r\nDataServiceVersion: 3.0\r\nIf-Match: W/"datetime\'2021-05-22T22%3A58%3A40.6450000Z\'"\r\nAccept: application/json\r\nContent-Type: application/json\r\n\r\n{"PartitionKey":"ad922e14-b371-4631-81ab-9e14e9c0e9ea","RowKey":"a"}\r\n--changeset_0d221006-845a-4c28-a176-dfc18410d0e4--\r\n\r\n--batch_a10acba3-03e0-4200-b4da-a0cd4f0017f6--\r\n`;

    const patchRequestResult = await postToAzurite(
      `$batch`,
      batchWithPatchRequestString,
      {
        version: "2019-02-02",
        options: {
          requestId: "5c43f514-9598-421a-a8d3-7b55a08a10c9",
          dataServiceVersion: "3.0"
        },
        multipartContentType:
          "multipart/mixed; boundary=batch_a10acba3-03e0-4200-b4da-a0cd4f0017f6",
        contentLength: 791,
        body: "ReadableStream"
      }
    );

    assert.strictEqual(patchRequestResult.status, 202);
    // we expect this to fail, as our batch request specifies the etag
    // https://docs.microsoft.com/en-us/rest/api/storageservices/merge-entity
    const weMerged = patchRequestResult.data.match(
      "HTTP/1.1 404 Not Found"
    ).length;
    assert.strictEqual(weMerged, 1);
  });

  it("Should be able to use query based on partition and row key in a batch request, @loki", async () => {
    const body = JSON.stringify({
      TableName: reproFlowsTableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    const createTableResult = await postToAzurite(
      "Tables",
      body,
      createTableHeaders
    );
    assert.strictEqual(createTableResult.status, 201);

    const batchWithQueryRequestString = `--batch_f351702c-c8c8-48c6-af2c-91b809c651ce\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nGET http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}(PartitionKey=\'Channel_19',RowKey='2') HTTP/1.1\r\nAccept: application/json;odata=minimalmetadata\r\n--batch_f351702c-c8c8-48c6-af2c-91b809c651ce--\r\n`;

    const queryRequestResult = await postToAzurite(
      `$batch`,
      batchWithQueryRequestString,
      {
        version: "2019-02-02",
        options: {
          requestId: "5c43f514-9598-421a-a8d3-7b55a08a10c9",
          dataServiceVersion: "3.0"
        },
        multipartContentType:
          "multipart/mixed; boundary=batch_f351702c-c8c8-48c6-af2c-91b809c651ce"
      }
    );

    assert.strictEqual(queryRequestResult.status, 202);
    // we expect this to fail, as our batch request specifies the etag
    // https://docs.microsoft.com/en-us/rest/api/storageservices/merge-entity
    const weMerged = queryRequestResult.data.match(
      "HTTP/1.1 404 Not Found"
    ).length;
    assert.strictEqual(weMerged, 1);
  });

  it("Should not be able to use query enties in a batch request, @loki", async () => {
    const body = JSON.stringify({
      TableName: reproFlowsTableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    const createTableResult = await postToAzurite(
      "Tables",
      body,
      createTableHeaders
    );
    assert.strictEqual(createTableResult.status, 201);

    const batchWithQueryRequestString = `--batch_f351702c-c8c8-48c6-af2c-91b809c651ce\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nGET http://127.0.0.1:10002/devstoreaccount1/${reproFlowsTableName}()? HTTP/1.1\r\nAccept: application/json;odata=minimalmetadata\r\n--batch_f351702c-c8c8-48c6-af2c-91b809c651ce--\r\n`;

    const queryRequestResult = await postToAzurite(
      `$batch`,
      batchWithQueryRequestString,
      {
        version: "2019-02-02",
        options: {
          requestId: "5c43f514-9598-421a-a8d3-7b55a08a10c9",
          dataServiceVersion: "3.0"
        },
        multipartContentType:
          "multipart/mixed; boundary=batch_f351702c-c8c8-48c6-af2c-91b809c651ce"
      }
    );

    assert.strictEqual(queryRequestResult.status, 202);
    // we expect this to fail, as we are using query entities inside the batch
    const notImplemented = queryRequestResult.data.match(
      "The requested operation is not implemented"
    ).length;
    assert.strictEqual(
      notImplemented,
      1,
      "We did not get the expected NotImplemented error."
    );
  });
});
