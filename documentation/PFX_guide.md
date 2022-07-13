### PFX

#### Generate PFX Certificate

You first need to generate a PFX file to use with Azurite.

You can use the following command to generate a PFX file with `dotnet dev-certs`, which is installed with the [.NET Core SDK](https://dotnet.microsoft.com/download).

```bash
dotnet dev-certs https --trust -ep cert.pfx -p <password>
```

> Storage Explorer does not currently work with certificates produced by `dotnet dev-certs`. While you can use them for Azurite and Azure SDKs, you won't be able to access the Azurite endpoints with Storage Explorer if you are using the certs created with dotnet dev-certs. We are tracking this issue on GitHub here: https://github.com/microsoft/AzureStorageExplorer/issues/2859

#### Start Azurite with HTTPS and PFX

Then you start Azurite with that cert and key.

```bash
azurite --cert cert.pem --key key.pem
```

NOTE: If you are using the Azure SDKs, then you will also need to pass the `--oauth basic` option.

#### Start Azurite
