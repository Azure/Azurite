# azurite-cli.ps1
# Reusable helpers for testing a local Azurite instance with the official Azure CLI (`az storage`).
#
# Quick start:
#   . .\scripts\azurite-cli.ps1     # dot-source to load the functions into your session
#   Use-Azurite                     # point the Azure CLI at local Azurite (sets connection string)
#   az storage container list -o table
#
# After Use-Azurite, every `az storage ...` command targets Azurite automatically.
#
# Optional convenience wrappers (thin shortcuts over `az storage`):
#   Test-AzuriteBlob                # runs a full blob lifecycle smoke test
#   Test-AzuriteQueue               # runs a full queue lifecycle smoke test
#   Test-AzuriteTable               # runs a full table lifecycle smoke test
#   Test-AzuriteAll                 # runs blob + queue + table smoke tests
#   New-AzuriteContainer mycontainer
#   Send-AzuriteBlob  mycontainer ./file.txt myblob.txt
#   Get-AzuriteBlobs  mycontainer
#   Receive-AzuriteBlob mycontainer myblob.txt ./out.txt

# --- Default Azurite emulator credentials (well-known, safe for local dev only) ---
$script:AzCliAccount = 'devstoreaccount1'
$script:AzCliKey     = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
$script:AzCliHost    = '127.0.0.1'

# Populated by Use-Azurite; passed explicitly via --connection-string on every `az` call
# so it works even when `az` is the Windows az.exe invoked from WSL (env vars don't cross).
$script:AzCliCS = $null

function Use-Azurite {
    <#
        Points the Azure CLI at the local Azurite instance for the current shell session.
        Builds the connection string (covers Blob, Queue and Table), stores it in
        $script:AzCliCS, and also exports AZURE_STORAGE_CONNECTION_STRING for ad-hoc commands.
    #>
    [CmdletBinding()]
    param(
        [string]$AzHost = $script:AzCliHost,
        [int]$BlobPort  = 10000,
        [int]$QueuePort = 10001,
        [int]$TablePort = 10002
    )

    $cs = @(
        "DefaultEndpointsProtocol=http"
        "AccountName=$script:AzCliAccount"
        "AccountKey=$script:AzCliKey"
        "BlobEndpoint=http://${AzHost}:$BlobPort/$script:AzCliAccount"
        "QueueEndpoint=http://${AzHost}:$QueuePort/$script:AzCliAccount"
        "TableEndpoint=http://${AzHost}:$TablePort/$script:AzCliAccount"
    ) -join ';'

    $script:AzCliCS = $cs
    $env:AZURE_STORAGE_CONNECTION_STRING = $cs
    Write-Host "Azure CLI is now pointed at Azurite ($AzHost  blob:$BlobPort queue:$QueuePort table:$TablePort)." -ForegroundColor Green
    Write-Host "Helpers pass --connection-string explicitly, so this works in WSL too." -ForegroundColor DarkGray
}

function Clear-Azurite {
    <# Removes the Azurite connection string so `az` targets real Azure / your login again. #>
    $script:AzCliCS = $null
    Remove-Item Env:AZURE_STORAGE_CONNECTION_STRING -ErrorAction SilentlyContinue
    Write-Host "Cleared Azurite connection string." -ForegroundColor Yellow
}

function Assert-AzuriteContext {
    if (-not $script:AzCliCS) {
        Write-Host "Connection string not set. Running Use-Azurite for you..." -ForegroundColor Yellow
        Use-Azurite
    }
}

# --- Thin convenience wrappers (entirely optional; plain `az storage` works too) ---

function New-AzuriteContainer {
    param([Parameter(Mandatory)][string]$Name)
    Assert-AzuriteContext
    az storage container create --name $Name --connection-string $script:AzCliCS --output table
}

function Send-AzuriteBlob {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$File,
        [string]$Name
    )
    Assert-AzuriteContext
    if (-not $Name) { $Name = Split-Path $File -Leaf }
    az storage blob upload --container-name $Container --name $Name --file $File --overwrite --connection-string $script:AzCliCS --output table
}

function Get-AzuriteBlobs {
    param([Parameter(Mandatory)][string]$Container)
    Assert-AzuriteContext
    az storage blob list --container-name $Container --connection-string $script:AzCliCS --output table
}

function Receive-AzuriteBlob {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Destination
    )
    Assert-AzuriteContext
    az storage blob download --container-name $Container --name $Name --file $Destination --connection-string $script:AzCliCS --output none
    Write-Host "Downloaded '$Name' -> '$Destination'" -ForegroundColor Green
}

function Test-AzuriteBlob {
    <# End-to-end blob smoke test: create container, upload, list, download, verify, cleanup. #>
    [CmdletBinding()]
    param([string]$Container = "smoketest$((Get-Random -Maximum 9999))")

    Assert-AzuriteContext
    $tmpDir  = [System.IO.Path]::GetTempPath()   # cross-platform (Windows/Linux/macOS)
    $tmpUp   = Join-Path $tmpDir "azurite-up-$([guid]::NewGuid()).txt"
    $tmpDown = Join-Path $tmpDir "azurite-down-$([guid]::NewGuid()).txt"
    $content = "azurite smoke test @ $(Get-Date -Format o)"

    try {
        Write-Host "`n[1/5] Create container '$Container'" -ForegroundColor Cyan
        az storage container create --name $Container --connection-string $script:AzCliCS --output table

        Write-Host "`n[2/5] Upload blob 'hello.txt'" -ForegroundColor Cyan
        Set-Content -Path $tmpUp -Value $content -Encoding ascii
        az storage blob upload --container-name $Container --name hello.txt --file $tmpUp --overwrite --connection-string $script:AzCliCS --output table

        Write-Host "`n[3/5] List blobs" -ForegroundColor Cyan
        az storage blob list --container-name $Container --connection-string $script:AzCliCS --output table

        Write-Host "`n[4/5] Download blob" -ForegroundColor Cyan
        az storage blob download --container-name $Container --name hello.txt --file $tmpDown --connection-string $script:AzCliCS --output none
        $roundTrip = (Get-Content $tmpDown -Raw).Trim()
        if ($roundTrip -eq $content) {
            Write-Host "Round-trip OK: content matches." -ForegroundColor Green
        } else {
            Write-Host "Round-trip MISMATCH!`n expected: $content`n got:      $roundTrip" -ForegroundColor Red
        }

        Write-Host "`n[5/5] Cleanup (delete container)" -ForegroundColor Cyan
        az storage container delete --name $Container --connection-string $script:AzCliCS --output table
        Write-Host "`nSmoke test complete." -ForegroundColor Green
    }
    finally {
        Remove-Item $tmpUp, $tmpDown -ErrorAction SilentlyContinue
    }
}

function Test-AzuriteQueue {
    <# End-to-end queue smoke test: create queue, enqueue, peek, verify, cleanup. #>
    [CmdletBinding()]
    param([string]$Queue = "smoketestq$((Get-Random -Maximum 99999))")

    Assert-AzuriteContext
    $content = "azurite queue smoke test @ $(Get-Date -Format o)"

    Write-Host "`n[1/4] Create queue '$Queue'" -ForegroundColor Cyan
    az storage queue create --name $Queue --connection-string $script:AzCliCS --output table

    Write-Host "`n[2/4] Enqueue message" -ForegroundColor Cyan
    az storage message put --queue-name $Queue --content $content --connection-string $script:AzCliCS --output table

    Write-Host "`n[3/4] Peek and verify message" -ForegroundColor Cyan
    $roundTrip = (az storage message peek --queue-name $Queue --num-messages 1 --connection-string $script:AzCliCS --query "[0].content" -o tsv).Trim()
    if ($roundTrip -eq $content) {
        Write-Host "Round-trip OK: message content matches." -ForegroundColor Green
    }
    else {
        Write-Host "Round-trip MISMATCH!`n expected: $content`n got:      $roundTrip" -ForegroundColor Red
    }

    Write-Host "`n[4/4] Cleanup (delete queue)" -ForegroundColor Cyan
    az storage queue delete --name $Queue --connection-string $script:AzCliCS --output table
    Write-Host "`nQueue smoke test complete." -ForegroundColor Green
}

function Test-AzuriteTable {
    <# End-to-end table smoke test: create table, insert entity, query, verify, cleanup. #>
    [CmdletBinding()]
    param([string]$Table = "smoketab$((Get-Random -Maximum 99999))")

    Assert-AzuriteContext
    $partitionKey = "pk$((Get-Random -Maximum 99999))"
    $rowKey = "rk$((Get-Random -Maximum 99999))"
    $value = "azurite_table_smoke_$(Get-Date -Format 'yyyyMMddTHHmmssZ')"

    Write-Host "`n[1/4] Create table '$Table'" -ForegroundColor Cyan
    az storage table create --name $Table --connection-string $script:AzCliCS --output table

    Write-Host "`n[2/4] Insert entity" -ForegroundColor Cyan
    az storage entity insert --table-name $Table --entity PartitionKey=$partitionKey RowKey=$rowKey Message=$value --connection-string $script:AzCliCS --output table

    Write-Host "`n[3/4] Query and verify entity" -ForegroundColor Cyan
    $roundTrip = (az storage entity query --table-name $Table --filter "PartitionKey eq '$partitionKey' and RowKey eq '$rowKey'" --select Message --connection-string $script:AzCliCS --query "items[0].Message" -o tsv).Trim()
    if ($roundTrip -eq $value) {
        Write-Host "Round-trip OK: entity value matches." -ForegroundColor Green
    }
    else {
        Write-Host "Round-trip MISMATCH!`n expected: $value`n got:      $roundTrip" -ForegroundColor Red
    }

    Write-Host "`n[4/4] Cleanup (delete table)" -ForegroundColor Cyan
    az storage table delete --name $Table --connection-string $script:AzCliCS --output table
    Write-Host "`nTable smoke test complete." -ForegroundColor Green
}

function Test-AzuriteAll {
    <# Full Azurite smoke test across Blob, Queue and Table. #>
    [CmdletBinding()]
    param()

    Assert-AzuriteContext
    Test-AzuriteBlob
    Test-AzuriteQueue
    Test-AzuriteTable
}

# When this script is RUN directly (.\scripts\azurite-cli.ps1) it auto-configures the
# connection string and runs full blob/queue/table smoke tests - no extra input needed.
# When it is DOT-SOURCED (. .\scripts\azurite-cli.ps1) it just loads the functions.
if ($MyInvocation.InvocationName -ne '.') {
    Use-Azurite
    Test-AzuriteAll
}
else {
    Write-Host "azurite-cli helpers loaded. Run 'Use-Azurite' to begin, then any 'az storage ...' command." -ForegroundColor DarkGray
    Write-Host "Try smoke tests with: Test-AzuriteBlob, Test-AzuriteQueue, Test-AzuriteTable" -ForegroundColor DarkGray
    Write-Host "Run all three with: Test-AzuriteAll" -ForegroundColor DarkGray
}
