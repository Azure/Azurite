using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Azure.Data.Tables;

namespace AzuriteTableTest
{
    internal static class TestForIssue791
    {
        internal static async Task RunTest()
        {
            var client = new TableServiceClient("UseDevelopmentStorage=true");
            var table = client.GetTableClient("test");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            await table.AddEntityAsync(new TableEntity(pk, "a"));

            var actions = new[]
            {
                new TableTransactionAction(TableTransactionActionType.Add, new TableEntity(pk, "a")),
            };

            try
            {
                await table.SubmitTransactionAsync(actions);
            }
            catch (TableTransactionFailedException ex)
            {
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
