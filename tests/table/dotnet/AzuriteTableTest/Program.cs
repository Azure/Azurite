using System.Threading.Tasks;



namespace AzuriteTableTest
{

    class Program
    {
        static async Task Main(string[] args)
        {
            // delete batch with cosmos
            //await TestForIssue1439.RunTest();

            // delete batch with data Tables
            //await TestForDataTablesDeleteBatch.RunTest();

            // convert double values with cosmos
            await TestForIssue1796.RunTest();
        }
    }
}
