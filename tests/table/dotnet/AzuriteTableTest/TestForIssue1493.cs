using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Azure.Data.Tables;

namespace AzuriteTableTest
{
    internal static class TestForIssue1493
    {
        internal static async Task RunTest()
        {
            var client = new TableServiceClient("UseDevelopmentStorage=true");

            var table = client.GetTableClient("test1");
            await table.CreateIfNotExistsAsync();

            var pk = Guid.NewGuid().ToString();
            



            try
            {
                var rA = await table.UpdateEntityAsync(new TableEntity(pk, "a"), new Azure.ETag("*"), TableUpdateMode.Merge);
                Console.WriteLine("Status : " + rA.Status);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
