### PEM

#### Generate PEM Certificate and Key

You have a few options to generate PEM certificate and key files. We'll show you how to use [mkcert](https://github.com/FiloSottile/mkcert) and [OpenSSL](https://www.openssl.org/).

##### mkcert

[mkcert](https://github.com/FiloSottile/mkcert) is a utility that makes the entire self-signed certificate process much easier because it wraps a lot of the complex commands that you need to manually execute with other utilities.

###### Generate Certificate and Key with mkcert

1. Install mkcert: https://github.com/FiloSottile/mkcert#installation. We like to use choco `choco install mkcert`, but you can install with any mechanism you'd like.
2. Run the following commands to install the Root CA and generate a cert for Azurite.

```bash
mkcert -install
mkcert 127.0.0.1
```

That will create two files. A certificate file: `127.0.0.1.pem` and a key file: `127.0.0.1-key.pem`.

###### Start Azurite with HTTPS and PEM

Then you start Azurite with that cert and key.

```bash
azurite --cert 127.0.0.1.pem --key 127.0.0.1-key.pem
```

If you start Azurite with docker, you need to map the folder contains the cert and key files to docker.
In following example, the local folder c:/azurite contains the cert and key files, and map it to /workspace on docker.

```bash
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 -v c:/azurite:/workspace  mcr.microsoft.com/azure-storage/azurite azurite --blobHost 0.0.0.0  --queueHost 0.0.0.0 --tableHost 0.0.0.0 --cert /workspace/127.0.0.1.pem --key /workspace/127.0.0.1-key.pem
```

##### OpenSSL

[OpenSSL](https://www.openssl.org/) is a TLS/SSL toolkit. You can use it to generate certificates. It is more involved than mkcert, but has more options.

###### Install OpenSSL on Windows

1. Download and install the OpenSSL v1.1.1a+ EXE from http://slproweb.com/products/Win32OpenSSL.html
2. Set the following environment variables

```bash
set OPENSSL_CONF=c:\OpenSSL-Win32\bin\openssl.cfg
set Path=%PATH%;c:\OpenSSL-Win32\bin
```

###### Generate Certificate and Key

Execute the following command to generate a cert and key with [OpenSSL](https://www.openssl.org/).

```bash
openssl req -newkey rsa:2048 -x509 -nodes -keyout key.pem -new -out cert.pem -sha256 -days 365 -addext "subjectAltName=IP:127.0.0.1" -subj "/C=CO/ST=ST/L=LO/O=OR/OU=OU/CN=CN"
```

The `-subj` values are required, but do not have to be valid. The `subjectAltName` must contain the Azurite IP address.

###### Add Certificate to Trusted Root Store

You then need to add that certificate to the Trusted Root Certification Authorities. This is required to work with Azure SDKs and Storage Explorer.

Here's how to do that on Windows:

```bash
certutil –addstore -enterprise –f "Root" cert.pem
```

#### Start Azurite with HTTPS and PEM

Then you start Azurite with that cert and key.

```bash
Azurite --cert cert.pem --key key.pem
```

NOTE: If you are using the Azure SDKs, then you will also need to pass the `--oauth basic` option.
