package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/data/aztables"
	"github.com/Azure/azure-sdk-for-go/storage"
	"github.com/google/uuid"
)

/*
This simple test written in go uses the Azure Table Storage SDK for Go to create a table,
insert some entities as a batch, and query the table for those entities.
This is to reproduce and ensure that we have not introduced any MIME Serialization bugs for
the Azure Go SDK.
I use the modified samples from the SDK and the Go SDK team to create this test and validate
the behavior of Azurite:
https://github.com/Azure/azure-sdk-for-go/tree/sdk/data/aztables/v1.0.1/sdk/data/aztables/
*/
func main() {
	var svc *aztables.ServiceClient
	// use a unique table name for each test run
	tableName := "go" + strings.Replace(uuid.New().String(), "-", "", -1)
	svc = login()
	createTable(svc, tableName)
	client := createTableClient(svc, tableName)
	insertSimple(client)
	insertBatch(tableName, "1", "3")
	query(client)
}

/*
Creates the service client for Azurite
*/
func login() *aztables.ServiceClient {
	connStr := "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
	svc, err := aztables.NewServiceClientFromConnectionString(connStr, nil)
	handle(err)
	return svc
}

func createTable(svc *aztables.ServiceClient, tableName string) {
	_, err := svc.CreateTable(context.TODO(), tableName, nil)
	handle(err)
}

/*
Create a client for the table to be able to create entities etc.
*/
func createTableClient(service *aztables.ServiceClient, tableName string) *aztables.Client {
	client := service.NewClient(tableName)

	return client
}

/*
Inserts several entities, using SDK's aztables modules for Go
*/
func insertSimple(client *aztables.Client) {

	for i := 0; i < 10; i++ {

		entity := createEntity(i)

		marshalled, err := json.Marshal(entity)
		handle(err)

		_, err = client.AddEntity(context.TODO(), marshalled, nil)
		handle(err)
	}

}

func createEntity(i int) aztables.EDMEntity {
	return aztables.EDMEntity{
		Entity: aztables.Entity{
			PartitionKey: "pencils",
			RowKey:       fmt.Sprintf("%d", i),
		},
		Properties: map[string]interface{}{
			"Product":      "Ticonderoga Pencils",
			"Price":        5.00,
			"Count":        aztables.EDMInt64(12345678901234),
			"ProductGUID":  aztables.EDMGUID("some-guid-value"),
			"DateReceived": aztables.EDMDateTime(time.Now()),
			"ProductCode":  aztables.EDMBinary([]byte("somebinaryvalue")),
		},
	}
}

/*
Inserts several entities, using SDK's storage modules for Go
From Azurite issue #1378
*/
func insertBatch(tableName string, partitionkey string, rowkey string) {

	client, err := storage.NewEmulatorClient()

	if err != nil {
		fmt.Printf("%s: \n", err)
	}

	ts := client.GetTableService()

	t := ts.GetTableReference("InsertBatchTestTable")

	tb := t.NewBatch()

	// insert
	entity1 := t.GetEntityReference(partitionkey, "rowkey1")
	tb.InsertEntity(entity1)

	// InsertOrReplace
	entity2 := t.GetEntityReference(partitionkey, `rowkey2`)
	tb.InsertOrReplaceEntity(entity2, true)

	//InsertOrMerge
	entity := t.GetEntityReference(partitionkey, rowkey)

	props := map[string]interface{}{
		"AmountDue":      200.23,
		"CustomerCode":   "123",
		"CustomerSince":  time.Date(1992, time.December, 20, 21, 55, 0, 0, time.UTC),
		"IsActive":       true,
		"NumberOfOrders": int64(255),
	}

	entity.Properties = props

	tb.InsertOrMergeEntity(entity, true)

	if err := tb.ExecuteBatch(); err != nil {
		if cerr, ok := err.(storage.AzureStorageServiceError); ok {
			if cerr.Code == "TableNotFound" {
				if cerr := t.Create(uint(10), storage.FullMetadata, nil); cerr != nil {
					fmt.Printf("error creating table: %v.", cerr)
					return
				}
				// retry
				err = tb.ExecuteBatch()
			}
		}
		handle(err)
	}

	handle(err)
}

func query(client *aztables.Client) {

	filter := "PartitionKey eq 'pencils'"
	options := &aztables.ListEntitiesOptions{
		Filter: &filter,
		Select: to.Ptr("RowKey,Value,Product,Available"),
		Top:    to.Ptr(int32(15)),
	}

	pager := client.NewListEntitiesPager(options)
	pageCount := 0
	for pager.More() {
		response, err := pager.NextPage(context.TODO())
		handle(err)

		fmt.Printf("There are %d entities in page #%d\n", len(response.Entities), pageCount)
		pageCount += 1

		for _, entity := range response.Entities {
			var myEntity aztables.EDMEntity
			err = json.Unmarshal(entity, &myEntity)
			handle(err)

			fmt.Printf("Received: %v, %v, %v, %v\n", myEntity.RowKey, myEntity.Properties["Value"], myEntity.Properties["Product"], myEntity.Properties["Available"])
		}
	}
}

func handle(err error) {
	if err != nil {
		fmt.Println(err)
		panic(err)
	}
}
