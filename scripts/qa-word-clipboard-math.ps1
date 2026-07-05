param(
  [string]$OutputPath = "docs/qa-artifacts/m16-1/word-clipboard-math.docx",
  [string]$HtmlPath = "",
  [ValidateSet("default", "keep-source", "merge", "destination", "plain-text")]
  [string]$PasteMode = "default",
  [switch]$UseCurrentClipboard,
  [string]$Variant = "fixture",
  [string]$BrowserName = "not-recorded",
  [string]$BrowserVersion = "not-recorded",
  [string]$ResultPath = "",
  [string]$PdfPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

function New-CfHtml([string]$fragment) {
  $html = "<html><body><!--StartFragment-->$fragment<!--EndFragment--></body></html>"
  $prefixTemplate = "Version:1.0`r`nStartHTML:{0:0000000000}`r`nEndHTML:{1:0000000000}`r`nStartFragment:{2:0000000000}`r`nEndFragment:{3:0000000000}`r`n"
  $dummyPrefix = [string]::Format($prefixTemplate, 0, 0, 0, 0)
  $startHtml = [System.Text.Encoding]::UTF8.GetByteCount($dummyPrefix)
  $startFragment = $startHtml + [System.Text.Encoding]::UTF8.GetByteCount("<html><body><!--StartFragment-->")
  $endFragment = $startFragment + [System.Text.Encoding]::UTF8.GetByteCount($fragment)
  $endHtml = $startHtml + [System.Text.Encoding]::UTF8.GetByteCount($html)
  $prefix = [string]::Format($prefixTemplate, $startHtml, $endHtml, $startFragment, $endFragment)
  return "$prefix$html"
}

$defaultMathFragment = @"
<p>Clipboard MathML acceptance:</p>
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mrow>
    <mi>E</mi>
    <mo>=</mo>
    <mfrac>
      <mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow>
      <mrow><msqrt><mi>y</mi></msqrt></mrow>
    </mfrac>
  </mrow>
</math>
"@

$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$absolutePdf = if ($PdfPath) {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PdfPath))
} else {
  [System.IO.Path]::ChangeExtension($absoluteOutput, ".pdf")
}
$outputDirectory = Split-Path -Parent $absoluteOutput
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$sourceMathCount = $null
if (-not $UseCurrentClipboard) {
  if ($HtmlPath) {
    $absoluteHtmlPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $HtmlPath))
    $sourceHtml = [System.IO.File]::ReadAllText($absoluteHtmlPath, [System.Text.Encoding]::UTF8)
    $startMarker = "<!--StartFragment-->"
    $endMarker = "<!--EndFragment-->"
    $start = $sourceHtml.IndexOf($startMarker)
    $end = $sourceHtml.IndexOf($endMarker)
    if ($start -lt 0 -or $end -le $start) {
      throw "HTML fixture must contain StartFragment and EndFragment markers."
    }
    $fragmentStart = $start + $startMarker.Length
    $mathFragment = $sourceHtml.Substring($fragmentStart, $end - $fragmentStart)
  } else {
    $mathFragment = $defaultMathFragment
  }
  $sourceMathCount = ([regex]::Matches($mathFragment, "<math(?:\s|>)")).Count
  $plainText = [System.Net.WebUtility]::HtmlDecode(
    ([regex]::Replace($mathFragment, "<[^>]+>", " ") -replace "\s+", " ").Trim()
  )
  $clipboardData = New-Object System.Windows.Forms.DataObject
  $clipboardData.SetData([System.Windows.Forms.DataFormats]::Html, (New-CfHtml $mathFragment))
  $clipboardData.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $plainText)
  [System.Windows.Forms.Clipboard]::Clear()
  [System.Windows.Forms.Clipboard]::SetDataObject($clipboardData, $true)
} else {
  $clipboardHtml = [System.Windows.Forms.Clipboard]::GetDataObject().GetData("HTML Format")
  if ($clipboardHtml) {
    $sourceMathCount = ([regex]::Matches([string]$clipboardHtml, "<math(?:\s|>)")).Count
  }
}

$clipboardFormats = @([System.Windows.Forms.Clipboard]::GetDataObject().GetFormats())

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$document = $null
$pasteElapsedMs = $null
$wordMathCount = $null
$wordVersion = $word.Version
$wordBuild = $word.Build
try {
  $document = $word.Documents.Add()
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  switch ($PasteMode) {
    "keep-source" { $word.Selection.PasteAndFormat(16) }
    "merge" { $word.Selection.PasteAndFormat(20) }
    "destination" { $word.Selection.PasteAndFormat(19) }
    "plain-text" { $word.Selection.TypeText([System.Windows.Forms.Clipboard]::GetText()) }
    default { $word.Selection.Paste() }
  }
  $stopwatch.Stop()
  $pasteElapsedMs = $stopwatch.ElapsedMilliseconds
  $wordMathCount = $document.OMaths.Count
  $document.SaveAs([ref]$absoluteOutput, [ref]16)
  $document.ExportAsFixedFormat($absolutePdf, 17)
} finally {
  if ($null -ne $document) {
    $document.Close([ref]$false)
  }
  $word.Quit()
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($absoluteOutput)
try {
  $entry = $zip.GetEntry("word/document.xml")
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    $xml = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
} finally {
  $zip.Dispose()
}

$oMathCount = ([regex]::Matches($xml, "<m:oMath(?: |>)")).Count
$oMathParaCount = ([regex]::Matches($xml, "<m:oMathPara(?: |>)")).Count
$drawingCount = ([regex]::Matches($xml, "<w:drawing(?: |>)")).Count
$altChunkCount = ([regex]::Matches($xml, "<w:altChunk(?: |>)")).Count
$hasOmml = $oMathCount -gt 0 -or $oMathParaCount -gt 0

if (-not $ResultPath) {
  $ResultPath = [System.IO.Path]::ChangeExtension($absoluteOutput, ".json")
} else {
  $ResultPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ResultPath))
}

$result = [ordered]@{
  output = $absoluteOutput
  renderedPdf = $absolutePdf
  result = $ResultPath
  timestampUtc = [DateTime]::UtcNow.ToString("o")
  os = [Environment]::OSVersion.VersionString
  browser = [ordered]@{
    name = $BrowserName
    version = $BrowserVersion
  }
  word = [ordered]@{
    version = $wordVersion
    build = $wordBuild
  }
  sourceVariant = $Variant
  usedCurrentClipboard = [bool]$UseCurrentClipboard
  clipboardFormats = $clipboardFormats
  pasteMode = $PasteMode
  pasteElapsedMs = $pasteElapsedMs
  sourceMathCount = $sourceMathCount
  wordMathCount = $wordMathCount
  convertedMathCount = $oMathCount
  droppedMathCount = if ($null -eq $sourceMathCount) { $null } else { [Math]::Max(0, $sourceMathCount - $oMathCount) }
  conversionRate = if ($sourceMathCount -gt 0) { [Math]::Round($oMathCount / $sourceMathCount, 4) } else { $null }
  hasOmml = $hasOmml
  oMathCount = $oMathCount
  oMathParaCount = $oMathParaCount
  drawingCount = $drawingCount
  altChunkCount = $altChunkCount
  hasFraction = $xml.Contains("<m:f>")
  hasRadical = $xml.Contains("<m:rad>")
  hasNary = $xml.Contains("<m:nary>")
  hasMatrix = $xml.Contains("<m:m>")
  hasAccent = $xml.Contains("<m:acc>")
  documentXmlBytes = [System.Text.Encoding]::UTF8.GetByteCount($xml)
}

$resultJson = $result | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($ResultPath, $resultJson, [System.Text.UTF8Encoding]::new($false))
$resultJson
