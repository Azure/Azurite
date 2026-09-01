<!-- BEGIN MICROSOFT SECURITY.MD V0.0.7 BLOCK -->

## Security

Microsoft takes the security of our software products and services seriously, which includes all source code repositories managed through our GitHub organizations, which include [Microsoft](https://github.com/Microsoft), [Azure](https://github.com/Azure), [DotNet](https://github.com/dotnet), [AspNet](https://github.com/aspnet), [Xamarin](https://github.com/xamarin), and [our GitHub organizations](https://opensource.microsoft.com/).

If you believe you have found a security vulnerability in any Microsoft-owned repository that meets [Microsoft's definition of a security vulnerability](https://aka.ms/opensource/security/definition), please report it to us as described below.

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them to the Microsoft Security Response Center (MSRC) at [https://msrc.microsoft.com/create-report](https://aka.ms/opensource/security/create-report).

If you prefer to submit without logging in, send email to [secure@microsoft.com](mailto:secure@microsoft.com).  If possible, encrypt your message with our PGP key; please download it from the [Microsoft Security Response Center PGP Key page](https://aka.ms/opensource/security/pgpkey).

You should receive a response within 24 hours. If for some reason you do not, please follow up via email to ensure we received your original message. Additional information can be found at [microsoft.com/msrc](https://aka.ms/opensource/security/msrc). 

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

  * Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
  * Full paths of source file(s) related to the manifestation of the issue
  * The location of the affected source code (tag/branch/commit or direct URL)
  * Any special configuration required to reproduce the issue
  * Step-by-step instructions to reproduce the issue
  * Proof-of-concept or exploit code (if possible)
  * Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

If you are reporting for a bug bounty, more complete reports can contribute to a higher bounty award. Please visit our [Microsoft Bug Bounty Program](https://aka.ms/opensource/security/bounty) page for more details about our active programs.

## Preferred Languages

We prefer all communications to be in English.

## Policy

Microsoft follows the principle of [Coordinated Vulnerability Disclosure](https://aka.ms/opensource/security/cvd).

<!-- END MICROSOFT SECURITY.MD BLOCK -->

## Azurite Security Features

### Docker Image Security

Azurite Docker images are built with security best practices:

- **Minimal Runtime:** Images use Node.js SEA (Single Executable Application) binaries on Alpine Linux, eliminating npm and development tools from production containers. This reduces the attack surface by ~64% compared to Node.js-based images.

- **CVE Elimination:** By removing npm from the production image, Azurite eliminates entire categories of transitive dependencies and their CVEs (including past vulnerabilities in `tar`, `brace-expansion`, and other npm packages). Vulnerabilities in npm's dependency tree cannot affect the containerized runtime.

- **Supply Chain Security:** No package manager in the production image means no supply-chain attack surface related to npm package installation or dependency resolution.

For detailed Docker security information, see [Docker.md](Docker.md#security-improvements).

### Code Security

- Regular dependency updates via Dependabot
- npm audit scans for known vulnerabilities
- GitHub security scanning enabled
- HTTPS support for all services
- OAuth and Shared Access Signature (SAS) authentication support

### Reporting Security Issues

If you discover a security vulnerability in Azurite, please follow the responsible disclosure process described above. Do not report security issues via public GitHub issues.

