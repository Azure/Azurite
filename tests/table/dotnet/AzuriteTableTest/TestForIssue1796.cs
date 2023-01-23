using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos.Table;


namespace AzuriteTableTest
{
    internal class TestForIssue1796
    {
        class TestEntity : TableEntity
        {
            public double Value { get; set; }
        }


        internal static async Task RunTest()
        {
            try
            {
                var account = CloudStorageAccount.DevelopmentStorageAccount;
                var cloudTableClient = new Microsoft.Azure.Cosmos.Table.CloudTableClient(account.TableStorageUri, account.Credentials);
                var cloudTable = cloudTableClient.GetTableReference("test1796");

                _ = await cloudTable.DeleteIfExistsAsync();
                await cloudTable.CreateAsync();

                var insertedEntity = new TestEntity { PartitionKey="pk", RowKey="rk", Value = 5d };
                _ = await cloudTable.ExecuteAsync(TableOperation.Insert(insertedEntity));
                Console.WriteLine("Entity inserted!");

                var tableResult = await cloudTable.ExecuteAsync(TableOperation.Retrieve<TestEntity>("pk", "rk"));
                var retrievedEntity = (TestEntity)tableResult.Result;
                Console.WriteLine("Entity retrieved!");

                if (retrievedEntity.Value != insertedEntity.Value) 
                {
                    throw new Exception("Values differ");
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
