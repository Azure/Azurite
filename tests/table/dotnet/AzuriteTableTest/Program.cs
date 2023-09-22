using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace AzuriteTableTest
{
    


    class Program
    {
        static async Task Main(string[] args)
        {
            // delete batch with cosmos
            await TestForIssue1958.RunTest();

            // // delete batch with data Tables
            // await TestForDataTablesDeleteBatch.RunTest();
        }
    }
}
