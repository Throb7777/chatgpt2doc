param(
  [string]$PackagePath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if ($PackagePath) {
  $bytes = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($PackagePath))
} else {
  $dataObject = [System.Windows.Forms.Clipboard]::GetDataObject()
  $source = $dataObject.GetData('Kingsoft WPS 9.0 Format', $false)
  if (-not ($source -is [System.IO.MemoryStream])) {
    throw 'The clipboard does not contain a WPS native package.'
  }

  $source.Position = 0
  $bytes = New-Object byte[] $source.Length
  [void]$source.Read($bytes, 0, $bytes.Length)
  $source.Position = 0
}

$clipboard = New-Object System.Windows.Forms.DataObject
$clipboard.SetData(
  'Kingsoft WPS 9.0 Format',
  $false,
  (New-Object System.IO.MemoryStream -ArgumentList @(,$bytes))
)
$clipboard.SetData([System.Windows.Forms.DataFormats]::UnicodeText, 'WPS equation package')
[System.Windows.Forms.Clipboard]::SetDataObject($clipboard, $true)

$fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($fullOutputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$application = $null
$document = $null
try {
  $application = New-Object -ComObject KWPS.Application
  $application.Visible = $false
  $document = $application.Documents.Add()
  $application.Selection.Paste()
  $document.SaveAs2($fullOutputPath, 12)
  $document.Close($false)
  $document = $null
  $application.Quit()
  $application = $null
} finally {
  if ($document) {
    try { $document.Close($false) } catch {}
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
  }
  if ($application) {
    try { $application.Quit() } catch {}
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($fullOutputPath)
try {
  $entry = $archive.GetEntry('word/document.xml')
  if (-not $entry) { throw 'The WPS output has no word/document.xml.' }
  $reader = New-Object System.IO.StreamReader -ArgumentList @(
    $entry.Open(),
    (New-Object System.Text.UTF8Encoding -ArgumentList $false)
  )
  try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally {
  $archive.Dispose()
}

$result = [ordered]@{
  outputPath = $fullOutputPath
  packagePath = if ($PackagePath) { [System.IO.Path]::GetFullPath($PackagePath) } else { $null }
  inputBytes = $bytes.Length
  oMathPara = ([regex]::Matches($xml, '<m:oMathPara(?:\s|>)')).Count
  oMath = ([regex]::Matches($xml, '<m:oMath(?:\s|>)')).Count
  drawing = ([regex]::Matches($xml, '<w:drawing(?:\s|>)')).Count
  object = ([regex]::Matches($xml, '<w:object(?:\s|>)')).Count
}

$result | ConvertTo-Json -Depth 4
if ($result.oMath -lt 1) {
  throw 'WPS did not paste the native package as an editable equation.'
}
