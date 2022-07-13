### Azure SDKs

To use Azurite with the [Azure SDKs](https://aka.ms/azsdk), you can use OAuth with HTTPS options:

`azurite --oauth basic --cert certname.pem --key certname-key.pem`

#### Azure Blob Storage

You can then instantiate BlobContainerClient, BlobServiceClient, or BlobClient.

```csharp
// With container url and DefaultAzureCredential
var client = new BlobContainerClient(new Uri("https://127.0.0.1:10000/devstoreaccount1/container-name"), new DefaultAzureCredential());

// With connection string
var client = new BlobContainerClient("DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=https://127.0.0.1:10001/devstoreaccount1;", "container-name");

// With account name and key
var client = new BlobContainerClient(new Uri("https://127.0.0.1:10000/devstoreaccount1/container-name"), new StorageSharedKeyCredential("devstoreaccount1", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="));
```

#### Azure Queue Storage

You can also instantiate QueueClient or QueueServiceClient.

```csharp
// With queue url and DefaultAzureCredential
var client = new QueueClient(new Uri("https://127.0.0.1:10001/devstoreaccount1/queue-name"), new DefaultAzureCredential());

// With connection string
var client = new QueueClient("DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=https://127.0.0.1:10001/devstoreaccount1;", "queue-name");

// With account name and key
var client = new QueueClient(new Uri("https://127.0.0.1:10001/devstoreaccount1/queue-name"), new StorageSharedKeyCredential("devstoreaccount1", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="));
```
