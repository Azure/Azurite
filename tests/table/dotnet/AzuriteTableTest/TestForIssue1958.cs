using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos.Table;

namespace AzuriteTableTest
{
    internal static class TestForIssue1958
    {
        internal static async Task RunTest()
        {
            var storageAccount = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
            var tableClient = storageAccount.CreateCloudTableClient();

            var client = tableClient.GetTableReference("foo");
            client.CreateIfNotExists();

            var batch = new TableBatchOperation
            {
                TableOperation.InsertOrMerge(new DynamicTableEntity("foo", "c8b06c47-c755-4b53-b3da-73949ebbb24f")),
                TableOperation.InsertOrMerge(new DynamicTableEntity("foo", "08667dfd-d2e0-4e20-a51e-7bc13d01c89c"))
            };

            // This errors with a 500 response
            var result = await client.ExecuteBatchAsync(batch);
            if(result[0].HttpStatusCode != 204 || result[1].HttpStatusCode != 204)
            {
                throw new Exception("Expected 204 response");
            }
            // clean up
            client.DeleteIfExists();
        }
    }
}
