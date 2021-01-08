# Featured Tags

- latest
  `docker pull mcr.microsoft.com/azure-storage/azurite`

# Full Tag Listing

- latest
- [More history tags](https://mcr.microsoft.com/v2/azure-storage/azurite/tags/list)

# About this Image

> Please refer to Azurite official GitHub [repository](https://github.com/Azure/Azurite) for more information.

Azurite is an open source Azure Storage API compatible server (emulator). Based on Node.js, Azurite provides cross platform experiences for customers wanting to try Azure Storage easily in a local environment. Azurite simulates most of the commands supported by Azure Storage with minimal dependencies.

# How to Use this Image

```bash
docker run -p 10000:10000 -p 10001:10001 mcr.microsoft.com/azure-storage/azurite
```

`-p 10000:10000` will expose blob service's default listening port.  
`-p 10001:10001` will expose queue service's default listening port.

Just run blob service:

```bash
docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0
```

**Run Azurite V3 docker image with customized persisted data location**

```bash
docker run -p 10000:10000 -p 10001:10001 -v c:/azurite:/data mcr.microsoft.com/azure-storage/azurite
```

`-v c:/azurite:/data` will use and map host path `c:/azurite` as Azurite's workspace location.

**Customize Azurite V3 supported parameters for docker image**

```bash
docker run -p 8888:8888 -p 9999:9999 -v c:/azurite:/workspace mcr.microsoft.com/azure-storage/azurite azurite -l /workspace -d /workspace/debug.log --blobPort 8888 --blobHost 0.0.0.0 --queuePort 9999 --queueHost 0.0.0.0 --loose --skipApiVersionCheck
```

Above command will try to start Azurite image with configurations:

`-l //workspace` defines folder `/workspace` as Azurite's location path inside docker instance, while `/workspace` is mapped to `c:/azurite` in host environment by `-v c:/azurite:/workspace`

`-d //workspace/debug.log` enables debug log into `/workspace/debug.log` inside docker instance. `debug.log` will also mapped to `c:/azurite/debug.log` in host machine because of docker volume mapping.

`--blobPort 8888` makes Azurite blob service listen to port 8888, while `-p 8888:8888` redirects requests from host machine's port 8888 to docker instance.

`--blobHost 0.0.0.0` defines blob service listening endpoint to accept requests from host machine.

`--queuePort 9999` makes Azurite queue service listen to port 9999, while `-p 9999:9999` redirects requests from host machine's port 9999 to docker instance.

`--queueHost 0.0.0.0` defines queue service listening endpoint to accept requests from host machine.

`--loose` enables loose mode which ignore unsupported headers and parameters.

`--skipApiVersionCheck` skip the request API version check.

> If you use customized azurite paramters for docker image, `--blobHost 0.0.0.0`, `--queueHost 0.0.0.0` are required parameters.

> In above sample, you need to use **double first forward slash** for location and debug path parameters to avoid a [known issue](https://stackoverflow.com/questions/48427366/docker-build-command-add-c-program-files-git-to-the-path-passed-as-build-argu) for Git on Windows.

Please refer to this [document](https://github.com/Azure/Azurite/blob/master/README.md) for **More supported parameters** like HTTPS or OAuth.

## Documentation

Please refer to this [document](https://github.com/Azure/Azurite/blob/master/README.md).

# Known Issues

Please go to Azurite GitHub repository [issues](https://github.com/Azure/Azurite/issues) for known issues.

# Feedback

Please go to Azurite GitHub repository [issues](https://github.com/Azure/Azurite/issues) for any feedbacks.

# License

This project is licensed under MIT.
