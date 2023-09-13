using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using System.Threading.Tasks;
using Azure.Data.Tables;
using System.Collections;

namespace AzuriteTableTest
{
  [TestFixture]
  public class DataTablesTests
  {

    [SetUp]
    public void Setup()
    {
    }

    [Test]
    public async Task TestForIssue793()
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
        Assert.Fail(ex.ToString());
      }

      Assert.Pass();

    }

    [Test]
    public async Task TestForIssue791()
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
        Assert.Fail(ex.ToString());
      }

      Assert.Pass();
    }

    [Test]
    public async Task TestForIssue1286()
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
        Assert.Fail(ex.ToString());
      }

      Assert.Pass();
    }

    [Test]
    public async Task TestForIssue1493()
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
        Assert.Fail(ex.ToString());
      }

      Assert.Pass();
    }
  }
}
