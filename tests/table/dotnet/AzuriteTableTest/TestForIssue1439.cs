using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos.Table;

namespace AzuriteTableTest
{
    internal static class TestForIssue1439
    {
        internal static async Task RunTest()
        {
            try
            {

                var account = CloudStorageAccount.DevelopmentStorageAccount;
                
                var cloudTableClient = new Microsoft.Azure.Cosmos.Table.CloudTableClient(account.TableStorageUri, account.Credentials);
                var cloudTable = cloudTableClient.GetTableReference("test5");
                cloudTable.CreateIfNotExists();

                TableEntity entity = new TableEntity() { PartitionKey = "1", RowKey = "1" };

                for (int i = 0; i < 13; i++)
                {
                    entity.RowKey = i.ToString();
                    TableOperation insertOperation = TableOperation.Insert(entity);
                    cloudTable.Execute(insertOperation);
                    Console.WriteLine("Entity inserted!");
                }

                TableBatchOperation batch = new TableBatchOperation();
                var query = new TableQuery().Where("PartitionKey eq '1'");
                TableQuerySegment<DynamicTableEntity> tableData = await cloudTable.ExecuteQuerySegmentedAsync(query, null);

                foreach (var tableEntity in tableData)
                {
                    batch.Delete(tableEntity);

                    if (batch.Count == 100) // cutoff at 100 to not exceed batch limits
                    {
                        await cloudTable.ExecuteBatchAsync(batch);
                        batch.Clear();
                    }
                }

                if (batch.Count > 0)
                {
                    var batchResult = await cloudTable.ExecuteBatchAsync(batch); // <- error thrown here
                    if (batchResult.Count == 0)
                    {
                        throw new Exception("Batch failed");
                    }
                }


            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
