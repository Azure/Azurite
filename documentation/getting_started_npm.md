### Install with NPM

In order to run Azurite V3 you need Node.js installed on your system. Azurite works cross-platform on Windows, Linux, and OS X.
Azurite is compatible with the current Node.Js LTS Versions in support.

After installation you can install Azurite simply with npm which is the Node.js package management tool included with every Node.js installation.

```cmd
npm install -g azurite
```

Simply start it with the following command:

```cmd
azurite -s -l c:\azurite -d c:\azurite\debug.log
```

or,

```cmd
azurite --silent --location c:\azurite --debug c:\azurite\debug.log
```

This tells Azurite to store all data in a particular directory `c:\azurite`. If the `-l` option is omitted it will use the current working directory. You can also selectively start different storage services.

For example, to start blob service only:

```bash
$ azurite-blob -l path/to/azurite/workspace
```

Start queue service only:

```bash
$ azurite-queue -l path/to/azurite/workspace
```

Start table service only:

```bash
$ azurite-table -l path/to/azurite/workspace
```
