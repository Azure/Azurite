using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Azure.Data.Tables;

namespace AzuriteTableTest
{
    internal static class TestForDataTablesDeleteBatch
    {
        internal static async Task RunTest()
        {
            var client = new TableServiceClient("UseDevelopmentStorage=true");
            var table = client.GetTableClient("testDataTables");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            var entity = new TableEntity(pk, "a");

            for(int i= 0; i < 13; i++)
            {
                entity.RowKey = i.ToString();
                await table.AddEntityAsync(entity);

            }

            TableTransactionAction[] actions = new TableTransactionAction[13];

            for (int i= 0; i < 13; i++)
            {
                actions[i] = new TableTransactionAction(TableTransactionActionType.Delete, new TableEntity(pk, i.ToString()));
            }
            
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
