param($installPath, $toolsPath, $package, $project)

Start-Process -FilePath (Join-Path $toolsPath 'azurite.exe') -ArgumentList "-l azurite_workspace"