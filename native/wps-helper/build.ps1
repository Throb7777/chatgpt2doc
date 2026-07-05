param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
  throw 'The .NET Framework C# compiler was not found.'
}

[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$output = Join-Path $OutputDirectory 'ChatExportWpsHost.exe'
& $compiler /nologo /target:exe /optimize+ /platform:anycpu /out:$output `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Web.Extensions.dll `
  /reference:System.Windows.Forms.dll `
  /reference:System.IO.Compression.dll `
  /reference:System.IO.Compression.FileSystem.dll `
  (Join-Path $PSScriptRoot 'ChatExportWpsHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'WPS helper compilation failed.' }
Write-Output $output
