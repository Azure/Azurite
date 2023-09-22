using NUnit.Framework;
using System.Threading.Tasks;
using Azure.Data.Tables;
using System;

namespace AzuriteTableTest
{

  [TestFixture]
  public class DataTablesBatchTests
  {
        private TableServiceClient tableServiceClient;
        private TableClient tableClient;

        [SetUp]
        public void Setup()
        {
            // We need to start Azurite externally, use "npm run table" in the Azurite root dir

            // Currently undecided if we should create the client per test, or use the setup...
            this.tableServiceClient = new TableServiceClient("UseDevelopmentStorage=true");
            
        }

        [Test]
        public async Task TestForDataTablesDeleteBatch()
        {
            this.tableClient = tableServiceClient.GetTableClient("testDataTablesBatch");
            await tableClient.CreateIfNotExistsAsync();
            var pk = Guid.NewGuid().ToString();
            var entity = new TableEntity(pk, "a");

            for (int i = 0; i < 13; i++)
            {
                entity.RowKey = i.ToString();
                await this.tableClient.AddEntityAsync(entity);

            }

            TableTransactionAction[] actions = new TableTransactionAction[13];

            for (int i = 0; i < 13; i++)
            {
                actions[i] = new TableTransactionAction(TableTransactionActionType.Delete, new TableEntity(pk, i.ToString()));
            }

            try
            {
                await this.tableClient.SubmitTransactionAsync(actions);
            }
            catch (TableTransactionFailedException ex)
            {
                Assert.Fail(ex.ToString());
            }
        }

    }
}