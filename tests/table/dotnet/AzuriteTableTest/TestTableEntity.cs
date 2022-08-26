using Microsoft.WindowsAzure.Storage.Table;
using System;
using System.Collections.Generic;
using System.Text;

namespace AzuriteTableTest
{
    internal class TestTableEntity : TableEntity
    {
        public double Value { get; set; }

        public TestTableEntity()
        {
        }

        public TestTableEntity(string partitionKey, string rowKey, double value)
        {
            PartitionKey = partitionKey;
            RowKey = rowKey;
            Value = value;
        }

        public TestTableEntity(double value)
        {
            Value = value;
        }
    }

}
