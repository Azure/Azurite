
#### Storage Explorer with Azurite HTTP

Connect to Azurite by click "Add Account" icon, then select "Attach to a local emulator" and click "Connect".

#### Storage Explorer with Azurite HTTPS

By default Storage Explorer will not open an HTTPS endpoint that uses a self-signed certificate. If you are running Azurite with HTTPS, then you are likely using a self-signed certificate. Fortunately, Storage Explorer allows you to import SSL certificates via the Edit -> SSL Certificates -> Import Certificates dialog.

##### Import Certificate to Storage Explorer

1. Find the certificate on your local machine.
   - **OpenSSL**: You can find the PEM file at the location you created in the [HTTPS Setup](#https-setup) section above.
   - **mkcert**: You need to import the RootCA.pem file, which can be found by executing this command in the terminal: `mkcert -CAROOT`. For mkcert, you want to import the RootCA.pem file, not the certificate file you created.
   - **dotnet dev-certs**: Storage Explorer doesn't currently work with certs produced by `dotnet dev-certs`. We are tracking this issue on GitHub here: https://github.com/microsoft/AzureStorageExplorer/issues/2859
2. Open Storage Explorer -> Edit -> SSL Certificates -> Import Certificates and import your certificate.

If you do not set this, then you will get the following error:

```
unable to verify the first certificate
```

or

```
self signed certificate in chain
```

##### Add Azurite via HTTPS Connection String

Follow these steps to add Azurite HTTPS to Storage Explorer:

1. Right click on Local & Attached -> Storage Accounts and select "Connect to Azure Storage...".
2. Select "Use a connection string" and click Next.
3. Enter a name, i.e Azurite.
4. Enter the [HTTPS connection string](#https-connection-strings) from the previous section of this document and click Next.

You can now explore the Azurite HTTPS endpoints with Storage Explorer.
