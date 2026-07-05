param(
  [Parameter(Mandatory = $true)]
  [string[]]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$ExtensionId = @($ExtensionId | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if ($ExtensionId.Count -eq 0 -or @($ExtensionId | Where-Object { $_ -notmatch '^[a-p]{32}$' }).Count -gt 0) {
  throw 'Every extension ID must contain exactly 32 letters from a to p.'
}
$hostName = 'com.chat_export_local.wps'
$sourceExe = Join-Path $PSScriptRoot 'dist\ChatExportWpsHost.exe'
if (-not (Test-Path -LiteralPath $sourceExe)) {
  & (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
}

$installDirectory = Join-Path $env:LOCALAPPDATA 'ChatExportLocal\WpsHelper'
[System.IO.Directory]::CreateDirectory($installDirectory) | Out-Null
$targetExe = Join-Path $installDirectory 'ChatExportWpsHost.exe'
$manifestPath = Join-Path $installDirectory ($hostName + '.json')
Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force

$manifest = [ordered]@{
  name = $hostName
  description = 'Local editable WPS clipboard helper for ChatGPT2Doc'
  path = $targetExe
  type = 'stdio'
  allowed_origins = @($ExtensionId | ForEach-Object { "chrome-extension://$_/" })
}
[System.IO.File]::WriteAllText(
  $manifestPath,
  ($manifest | ConvertTo-Json -Depth 4),
  (New-Object System.Text.UTF8Encoding -ArgumentList $false)
)

foreach ($browserKey in @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
)) {
  $key = Join-Path $browserKey $hostName
  New-Item -Path $key -Force | Out-Null
  Set-Item -Path $key -Value $manifestPath
}

[pscustomobject]@{
  installed = $true
  extensionIds = $ExtensionId
  host = $hostName
  manifest = $manifestPath
} | ConvertTo-Json -Depth 3
