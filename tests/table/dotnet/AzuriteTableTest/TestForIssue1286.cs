using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Azure.Data.Tables;

namespace AzuriteTableTest
{
    internal static class TestForIssue1286
    {
        internal static async Task RunTest()
        {
            var client = new TableServiceClient("UseDevelopmentStorage=true");
            var table = client.GetTableClient("test");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            var rA = await table.AddEntityAsync(new TableEntity(pk, "a"));
            await table.UpsertEntityAsync(new TableEntity(pk, "a"));

            var actions = new[]
            {
                new TableTransactionAction(TableTransactionActionType.UpdateReplace, new TableEntity(pk, "a"), rA.Headers.ETag.Value),
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
