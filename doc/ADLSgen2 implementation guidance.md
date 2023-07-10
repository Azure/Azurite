### Background
Azurite is an open-source Azure Storage API compatible server (emulator). It currently supports the Blob, Queue, and Table services. We have received many customer asks on ADLSGen2 support in Azurite from many channels, include but not limited to [github issues](https://github.com/Azure/Azurite/issues/553), email, and requests from interested teams at Microsoft.

We have get 2 PRs ([PR1](https://github.com/Azure/Azurite/pull/1933), [PR2](https://github.com/Azure/Azurite/pull/1934)) submitted by the community , try to implement ADLSgen2 in Azurite. However, we can't merge them now since they might not meet our expectation and merge bar.

Azurite welcome contribution. To better coorporate with community on implement ADLSGen2 in Azurite, this document gives the details of the plan we suggest to implement ADLS Gen 2 in Azurite, and our expectations for community submissions that we can accept as PRs. 

### ADLSGen2 Introduction
It's very important to understand ADLSgen2 feature before implementing it in Azurite.

[Azure Data Lake Storage Gen2](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction) (aka: AdlsGen2) is a set of capabilities dedicated to big data analytics and built on Azure Blob Storage. 
#### FNS vs. HNS
A normal Azure storage account is with Flat namespace (FNS). 

Users can provision a [hierarchical namespace](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-namespace) (HNS) storage account by creating storage account with HNS, or migrate an existing storage account from FNS to HNS. However, users can’t revert HNS accounts back to FNS.

HNS is a key feature that Azure Data Lake Storage Gen2 provides:
- High-performance data access at object storage scale and price.
- Atomic directory manipulation
- Familiar interface style like file systems

#### DFS vs Blob
Azure Data Lake Storage Gen2 is primarily designed to work with Hadoop and all frameworks that use HDFS as their data access layer. A new endpoint DFS is introduced ADLSGen2.

The DFS endpoint is available on both HNS and FNS accounts. Per our test, on FNS account, the [DFS rest API](https://learn.microsoft.com/en-us/rest/api/storageservices/data-lake-storage-gen2) behavior is different from HNS account, [Blob rest API](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api) also behaviors differently on FNS/HNS account. The [rest API doc](https://learn.microsoft.com/en-us/rest/api/storageservices/data-lake-storage-gen2) already includes part of the differences. 

### ADLSgen2 in Azurite
#### Current status: 
<table>
<tr>  
<th></th>
<th>FNS account</th>
<th>HNS account</th>
</tr>
<tr>
<td>Blob Endpoint API</td>
<td>Already implemented in Azurite.
  
(The customer PR1 is mostly in refine and revise blob API implementation.)</td>
<td>Not in Azurite, Phase II in below plan.
  
Behavior similar as FNS blob, but should have a little different on API, and performance different</td>
</tr>
<tr>
<td>Dfs Endpoint API</td>
<td>Not in Azurite, Phase I in below plan.
  
Support most DFS API, but some action not supported and API behavior different, and performance/atomic different</td>
<td>Not in Azurite, Phase II in below plan

Support all DFS APIs, including ACL/permission support.

(The customer PR2 is mostly on these APIs.)</td>
</tr>
</table>

#### Implementation Plan:
##### Phase I: implementation DFS API on FNS account 
1. This should be much simpler than HNS account implementation.
    1. Current Azurite is based on FNS account, so: 
        1. Don’t need to change data store structure.
        2. Don’t need Azurite user to differ HNS/FNS account.
           
2. The change will add all dfs API interface to Azurite, which can help to support phase II.
   
4. Code change should be split into several small PRs as following:
    1. 1 PR to add dfs swagger and the auto-generated API interface (no manual change on auto generated code)
    2. 1 PR to add DFS endpoint 
    3. Several PRs to implement each dfs API (with credential handler), include testing
       
5. Need make sure each API behavior is aligned on rest API doc , also aligned with real Azure Server. See more in validation criteria.
   
7. The blob/dfs endpoint should share same data store, talk to same instance of BlobLokiMetadataStore & BlobSqlMetadataStore
   
9. Need to work with Azure Storage SDKs to change and support new dfs port (say: 10004)
    1. E.g. .Net SDK need changes the blob/dfs Uri convert function in [this file](https://github.com/Azure/azure-sdk-for-net/blob/e8c40cc204b8cf750fcc820eab90d11f80612c3a/sdk/storage/Azure.Storage.Files.DataLake/src/DataLakeUriBuilder.cs#L275)
       
##### Phase II: implementation Blob/DFS on HNS account
1. Azurite user need configure each Azurite Account type as HNS/FNS when Azurite starts up. 
    1. Need design how to input the config (default should be FNS)
    2.How to handle it when user start Azurite with change account type? (Report error? )

2. Implement HNS metadata Store in Azurite
    1. Any schema change or new table design should be reviewed and signed off.
    2. We need to maintain hierarchical relationships between parent-child dir/file. For example, we can add a table to match each item (blob/dir) with its parent, and integrate existing blob tables and the new table added above (Detail design need discussion).
    3. Blob/file binary payload persistency based on local files shouldn’t be changed.

3. OAuth & ACL (Not priority in Phase II):
    1. Limited by no emulation on AAD and related components to provide information like user identity information, currently with bearer token, Azurite always assumes the user has enough Role permission, so OAuth authentication will always pass, then ACL authentication won’t take effect. We might need add configuration to fail OAuth check and make ACL check works.
    2. For groups in ACL, per the limitation of no emulation on AAD, Azurite can’t access AD to check if a user is in some group.

4. Need make sure each API behavior is aligned on rest API doc , also aligned with real Azure Server. See more in validation criteria.

5. Implement each features/APIs (priority from high to low, 1-6 should be P1)
    1. Create/Update/Delete/Get filesystem.
    2. List filesystem (continuation token).
    3. Create/Update/Delete/Get single directory/file.
    4. List directory/file (continuation token).
    5. Set/Get ACL/permission/user/group on single directory/file.
    6. SAS: Support DFS sas (and blob sas, account sas)
    7. Set/Update/Remove ACL recursive (with continuation token).
   
##### Phase III and more
1.	OAuth: ACL works when user login with AAD account.
2.	Other left features / work items, we will add the detail plan by then.


#### Validation criteria
- No regression on Blob API on FNS account.
- Test Case
    - Need to cover each API and parameters.
        - For enum/bool parameters need cover all possible values.
        - For number parameters need to cover maximum, minimum values.
        - For optional parameters need to cover explicit and empty(default) values.
    - Need to cover all possible return HTTP and Azure Storage error codes.
    - Need to run and pass against Azurite hosted storage account and Azure Storage cloud accounts.
- Needs to pass all language SDK test (JS, .net, java, go, python …) and ABFS test, at least on GA.
- Needs to pass test on Storage Explorer.

#### Engineering process
- We can use GitHub issues to track the work. 
- We should first merge the PR to a preview branch, then after a phase complete, then merge the change back to main and release.
- Each PR should be small for quick review.
- Maintain: the code needs to be maintained (investigate/fix issues) by the PR owner for some time (e.g. till feature GA).
    - Need clean/detail doc to introduce the implementation.

### Reference:
[Azure Data Lake Storage Gen2 Introduction - Azure Storage | Microsoft Learn](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction)

[Azure Data Lake Storage Gen2 hierarchical namespace - Azure Storage | Microsoft Learn](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-namespace)

[Blob Storage REST API - Azure Storage | Microsoft Learn](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api)

[Azure Data Lake Storage Gen2 REST API reference - Azure Storage | Microsoft Learn](https://learn.microsoft.com/en-us/rest/api/storageservices/data-lake-storage-gen2)
