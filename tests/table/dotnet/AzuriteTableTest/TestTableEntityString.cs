using Microsoft.WindowsAzure.Storage.Table;

namespace AzuriteTableTest
{
    public class TestTableEntityString : TableEntity
    {
        public string Value { get; set; }

        public TestTableEntityString()
        {

        }

        public TestTableEntityString(string partitionKey, string rowKey)
        {
            PartitionKey = partitionKey;
            RowKey = rowKey;
        }

        public TestTableEntityString(string partitionKey, string rowKey, string value)
        {
            PartitionKey = partitionKey;
            RowKey = rowKey;
            Value = value;
        }
    }

}
