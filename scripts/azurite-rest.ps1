# azurite-rest.ps1
# Helper to fire raw REST calls against Azurite using Shared Key (HMAC-SHA256) auth.
#
# Usage examples (run from a PowerShell prompt after dot-sourcing this file):
#   . .\scripts\azurite-rest.ps1
#   Invoke-Azurite -Service blob  -Method PUT -Resource 'mycontainer' -Query @{ restype = 'container' }
#   Invoke-Azurite -Service blob  -Method GET -Resource ''           -Query @{ comp = 'list' }   # list containers
#   Invoke-Azurite -Service blob  -Method PUT -Resource 'mycontainer/hello.txt' -Body 'Hello Azurite' -Headers @{ 'x-ms-blob-type' = 'BlockBlob' }
#   Invoke-Azurite -Service blob  -Method GET -Resource 'mycontainer/hello.txt'
#   Invoke-Azurite -Service blob  -Method GET -Resource 'mycontainer' -Query @{ restype = 'container'; comp = 'list' }  # list blobs
#   Invoke-Azurite -Service blob  -Method DELETE -Resource 'mycontainer/hello.txt'
#
#   Invoke-Azurite -Service queue -Method PUT -Resource 'myqueue'
#   Invoke-Azurite -Service queue -Method POST -Resource 'myqueue/messages' -Body '<QueueMessage><MessageText>aGVsbG8=</MessageText></QueueMessage>' -Headers @{ 'Content-Type' = 'application/xml' }
#
# Table service (different signature scheme - use Invoke-AzuriteTable):
#   Invoke-AzuriteTable -Method POST -Resource 'Tables' -Body '{"TableName":"mytable"}'
#   Invoke-AzuriteTable -Method GET  -Resource 'Tables'
#   Invoke-AzuriteTable -Method POST -Resource 'mytable' -Body '{"PartitionKey":"p1","RowKey":"r1","Name":"Alice"}'
#   Invoke-AzuriteTable -Method GET  -Resource "mytable(PartitionKey='p1',RowKey='r1')"
#   Invoke-AzuriteTable -Method DELETE -Resource "mytable(PartitionKey='p1',RowKey='r1')" -Headers @{ 'If-Match' = '*' }

$script:AzAccount = 'devstoreaccount1'
$script:AzKey     = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
$script:AzPorts   = @{ blob = 10000; queue = 10001; table = 10002 }

function Invoke-Azurite {
    param(
        [ValidateSet('blob', 'queue', 'table')]
        [string]$Service = 'blob',

        [string]$Method = 'GET',

        # Path after the account, e.g. 'mycontainer/hello.txt'
        [string]$Resource = '',

        # Query string parameters as a hashtable, e.g. @{ restype = 'container' }
        [hashtable]$Query = @{},

        # Extra request headers (e.g. x-ms-blob-type)
        [hashtable]$Headers = @{},

        # Request body (string)
        [string]$Body = ''
    )

    $port = $script:AzPorts[$Service]
    $apiVersion = '2025-05-05'
    $date = [DateTime]::UtcNow.ToString('R')

    # Build canonicalized query string (sorted, lowercased keys)
    $sortedKeys = $Query.Keys | Sort-Object
    $queryParts = foreach ($k in $sortedKeys) { "$($k.ToLowerInvariant()):$($Query[$k])" }
    $canonicalizedQuery = ($queryParts -join "`n")

    $uriQuery = ''
    if ($Query.Count -gt 0) {
        $pairs = foreach ($k in $sortedKeys) {
            "$([uri]::EscapeDataString($k))=$([uri]::EscapeDataString([string]$Query[$k]))"
        }
        $uriQuery = '?' + ($pairs -join '&')
    }

    $bodyBytes  = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $contentLen = if ($bodyBytes.Length -gt 0) { "$($bodyBytes.Length)" } else { '' }
    $contentType = if ($Headers.ContainsKey('Content-Type')) { $Headers['Content-Type'] } else { '' }

    # Canonicalized headers: all x-ms-* headers, lowercased, sorted, joined with \n
    $msHeaders = @{
        'x-ms-date'    = $date
        'x-ms-version' = $apiVersion
    }
    foreach ($h in $Headers.Keys) {
        if ($h.ToLowerInvariant().StartsWith('x-ms-')) { $msHeaders[$h.ToLowerInvariant()] = $Headers[$h] }
    }
    $canonHeaders = ($msHeaders.Keys | Sort-Object | ForEach-Object { "$($_):$($msHeaders[$_])" }) -join "`n"

    # Canonicalized resource. NOTE: for the emulator the account name appears twice.
    $resourcePath = "/$script:AzAccount/$script:AzAccount"
    if ($Resource) { $resourcePath += "/$Resource" }
    $canonResource = $resourcePath
    if ($canonicalizedQuery) { $canonResource += "`n$canonicalizedQuery" }

    # String-to-sign (Blob/Queue Shared Key)
    $stringToSign = @(
        $Method.ToUpperInvariant()
        ''               # Content-Encoding
        ''               # Content-Language
        $contentLen      # Content-Length ('' if 0)
        ''               # Content-MD5
        $contentType     # Content-Type
        ''               # Date (using x-ms-date instead)
        ''               # If-Modified-Since
        ''               # If-Match
        ''               # If-None-Match
        ''               # If-Unmodified-Since
        ''               # Range
        $canonHeaders
        $canonResource
    ) -join "`n"

    $keyBytes = [Convert]::FromBase64String($script:AzKey)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
    $sig = [Convert]::ToBase64String($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($stringToSign)))
    $authHeader = "SharedKey $($script:AzAccount):$sig"

    $allHeaders = @{
        'x-ms-date'     = $date
        'x-ms-version'  = $apiVersion
        'Authorization' = $authHeader
    }
    foreach ($h in $Headers.Keys) {
        if ($h -ne 'Content-Type') { $allHeaders[$h] = $Headers[$h] }
    }

    $url = "http://127.0.0.1:$port/$script:AzAccount"
    if ($Resource) { $url += "/$Resource" }
    $url += $uriQuery

    Write-Host ">> $Method $url" -ForegroundColor Cyan

    $params = @{
        Uri     = $url
        Method  = $Method
        Headers = $allHeaders
    }
    if ($bodyBytes.Length -gt 0) {
        $params['Body'] = $bodyBytes
        if ($contentType) { $params['ContentType'] = $contentType }
    }

    try {
        Invoke-WebRequest @params -UseBasicParsing
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        # PowerShell 7+ exposes the response body here:
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
        }
        # Windows PowerShell 5.1 fallback:
        elseif ($_.Exception.Response -and ($_.Exception.Response -is [System.Net.HttpWebResponse])) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            Write-Host $reader.ReadToEnd() -ForegroundColor Yellow
        }
    }
}

function Invoke-AzuriteTable {
    # Table service uses a simpler 'SharedKey' signature than Blob/Queue:
    #   StringToSign = VERB + \n + Content-MD5 + \n + Content-Type + \n + Date + \n + CanonicalizedResource
    param(
        [string]$Method = 'GET',

        # Table resource, e.g. 'Tables', 'mytable', or "mytable(PartitionKey='p',RowKey='r')"
        [string]$Resource = 'Tables',

        # Query string parameters as a hashtable (only 'comp' participates in signing)
        [hashtable]$Query = @{},

        # Extra request headers (e.g. If-Match)
        [hashtable]$Headers = @{},

        # Request body (JSON string)
        [string]$Body = ''
    )

    $port = $script:AzPorts['table']
    $apiVersion = '2025-05-05'
    $date = [DateTime]::UtcNow.ToString('R')

    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    # Content-Type is only sent (and therefore only signed) when there is a body.
    if ($bodyBytes.Length -gt 0) {
        $contentType = if ($Headers.ContainsKey('Content-Type')) { $Headers['Content-Type'] } else { 'application/json' }
    }
    else {
        $contentType = ''
    }

    # Build query string for the URL (sorted)
    $sortedKeys = $Query.Keys | Sort-Object
    $uriQuery = ''
    if ($Query.Count -gt 0) {
        $pairs = foreach ($k in $sortedKeys) {
            "$([uri]::EscapeDataString($k))=$([uri]::EscapeDataString([string]$Query[$k]))"
        }
        $uriQuery = '?' + ($pairs -join '&')
    }

    # CanonicalizedResource for Table = /account/resource, plus ?comp=... only if present.
    # For the emulator the account name appears twice.
    $canonResource = "/$script:AzAccount/$script:AzAccount/$Resource"
    if ($Query.ContainsKey('comp')) { $canonResource += "?comp=$($Query['comp'])" }

    $stringToSign = @(
        $Method.ToUpperInvariant()
        ''               # Content-MD5
        $contentType     # Content-Type
        $date            # Date
        $canonResource
    ) -join "`n"

    $keyBytes = [Convert]::FromBase64String($script:AzKey)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
    $sig = [Convert]::ToBase64String($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($stringToSign)))
    $authHeader = "SharedKey $($script:AzAccount):$sig"

    $allHeaders = @{
        'x-ms-date'     = $date
        'Date'          = $date
        'x-ms-version'  = $apiVersion
        'Authorization' = $authHeader
        'Accept'        = 'application/json;odata=nometadata'
        'DataServiceVersion' = '3.0;NetFx'
    }
    foreach ($h in $Headers.Keys) {
        if ($h -ne 'Content-Type') { $allHeaders[$h] = $Headers[$h] }
    }

    $url = "http://127.0.0.1:$port/$script:AzAccount/$Resource$uriQuery"
    Write-Host ">> $Method $url" -ForegroundColor Cyan

    $params = @{
        Uri     = $url
        Method  = $Method
        Headers = $allHeaders
    }
    if ($bodyBytes.Length -gt 0) {
        $params['Body'] = $bodyBytes
        $params['ContentType'] = $contentType
    }

    try {
        Invoke-WebRequest @params -UseBasicParsing
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
        }
        elseif ($_.Exception.Response -and ($_.Exception.Response -is [System.Net.HttpWebResponse])) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            Write-Host $reader.ReadToEnd() -ForegroundColor Yellow
        }
    }
}

function Test-AzuriteRest {
    # End-to-end smoke test of the raw REST helpers across Blob, Queue and Table.
    # Includes explicit round-trip assertions so failures are visible and actionable.
    $container = "resttest$(Get-Random -Maximum 9999)"
    $queue     = "resttest$(Get-Random -Maximum 9999)"
    $table     = "resttest$(Get-Random -Maximum 9999)"

    Write-Host "`n===== BLOB =====" -ForegroundColor Magenta
    Write-Host "[1] Create container" -ForegroundColor Cyan
    $blobCreate = Invoke-Azurite -Service blob -Method PUT -Resource $container -Query @{ restype = 'container' }
    if (-not $blobCreate) { throw "Blob create container failed." }

    Write-Host "[2] Upload blob" -ForegroundColor Cyan
    $blobUpload = Invoke-Azurite -Service blob -Method PUT -Resource "$container/hello.txt" -Body 'Hello Azurite REST' -Headers @{ 'x-ms-blob-type' = 'BlockBlob'; 'Content-Type' = 'text/plain' }
    if (-not $blobUpload) { throw "Blob upload failed." }

    Write-Host "[3] Download blob and verify" -ForegroundColor Cyan
    $blobGet = Invoke-Azurite -Service blob -Method GET -Resource "$container/hello.txt"
    if (-not $blobGet) { throw "Blob download failed." }
    $blob = $blobGet.Content
    if ($blob -ne 'Hello Azurite REST') { throw "Blob round-trip mismatch. Expected 'Hello Azurite REST', got '$blob'." }
    Write-Host "Round-trip OK: blob content matches." -ForegroundColor Green

    Write-Host "[4] Delete container" -ForegroundColor Cyan
    $blobDelete = Invoke-Azurite -Service blob -Method DELETE -Resource $container -Query @{ restype = 'container' }
    if (-not $blobDelete) { throw "Blob delete container failed." }

    Write-Host "`n===== QUEUE =====" -ForegroundColor Magenta
    Write-Host "[1] Create queue" -ForegroundColor Cyan
    $queueCreate = Invoke-Azurite -Service queue -Method PUT -Resource $queue
    if (-not $queueCreate) { throw "Queue create failed." }

    Write-Host "[2] Put message" -ForegroundColor Cyan
    $queuePut = Invoke-Azurite -Service queue -Method POST -Resource "$queue/messages" -Body '<QueueMessage><MessageText>aGVsbG8=</MessageText></QueueMessage>' -Headers @{ 'Content-Type' = 'application/xml' }
    if (-not $queuePut) { throw "Queue put message failed." }

    Write-Host "[3] Peek messages and verify" -ForegroundColor Cyan
    $queuePeek = Invoke-Azurite -Service queue -Method GET -Resource "$queue/messages" -Query @{ peekonly = 'true' }
    if (-not $queuePeek) { throw "Queue peek failed." }
    [xml]$queueXml = $queuePeek.Content
    $msgBase64 = $queueXml.QueueMessagesList.QueueMessage.MessageText
    $decodedMsg = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($msgBase64))
    if ($decodedMsg -ne 'hello') { throw "Queue round-trip mismatch. Expected 'hello', got '$decodedMsg'." }
    Write-Host "Round-trip OK: queue message matches." -ForegroundColor Green

    Write-Host "[4] Delete queue" -ForegroundColor Cyan
    $queueDelete = Invoke-Azurite -Service queue -Method DELETE -Resource $queue
    if (-not $queueDelete) { throw "Queue delete failed." }

    Write-Host "`n===== TABLE =====" -ForegroundColor Magenta
    Write-Host "[1] Create table" -ForegroundColor Cyan
    $tableCreate = Invoke-AzuriteTable -Method POST -Resource 'Tables' -Body "{`"TableName`":`"$table`"}"
    if (-not $tableCreate) { throw "Table create failed." }

    Write-Host "[2] Insert entity" -ForegroundColor Cyan
    $tableInsert = Invoke-AzuriteTable -Method POST -Resource $table -Body '{"PartitionKey":"p1","RowKey":"r1","Name":"Alice"}'
    if (-not $tableInsert) { throw "Table insert entity failed." }

    Write-Host "[3] Query entity and verify" -ForegroundColor Cyan
    $tableGet = Invoke-AzuriteTable -Method GET -Resource "$table(PartitionKey='p1',RowKey='r1')"
    if (-not $tableGet) { throw "Table query entity failed." }
    $entity = $tableGet.Content | ConvertFrom-Json
    if ($entity.Name -ne 'Alice') { throw "Table round-trip mismatch. Expected Name='Alice', got '$($entity.Name)'." }
    Write-Host "Round-trip OK: table entity matches." -ForegroundColor Green

    Write-Host "[4] Delete table" -ForegroundColor Cyan
    $tableDelete = Invoke-AzuriteTable -Method DELETE -Resource "Tables('$table')" -Headers @{ 'If-Match' = '*' }
    if (-not $tableDelete) { throw "Table delete failed." }

    Write-Host "`nREST smoke test complete. All checks passed." -ForegroundColor Green
}

# When RUN directly (.\scripts\azurite-rest.ps1) auto-run the full REST smoke test.
# When DOT-SOURCED (. .\scripts\azurite-rest.ps1) just load the functions.
if ($MyInvocation.InvocationName -ne '.') {
    Test-AzuriteRest
}
