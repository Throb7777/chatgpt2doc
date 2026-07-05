$ErrorActionPreference = 'Stop'
$hostName = 'com.chat_export_local.wps'
foreach ($browserKey in @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
)) {
  $key = Join-Path $browserKey $hostName
  if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force }
}
$installDirectory = Join-Path $env:LOCALAPPDATA 'ChatExportLocal\WpsHelper'
if (Test-Path -LiteralPath $installDirectory) {
  Remove-Item -LiteralPath $installDirectory -Recurse -Force
}
Write-Output '{"uninstalled":true}'
