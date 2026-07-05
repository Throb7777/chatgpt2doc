param(
  [Parameter(Mandatory = $true)]
  [string]$InputDirectory
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$absoluteDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path (Get-Location) $InputDirectory)
)
$htmlPath = Join-Path $absoluteDirectory "clipboard.html"
$textPath = Join-Path $absoluteDirectory "clipboard.txt"

if (-not (Test-Path -LiteralPath $htmlPath)) {
  throw "Missing clipboard.html in $absoluteDirectory"
}
if (-not (Test-Path -LiteralPath $textPath)) {
  throw "Missing clipboard.txt in $absoluteDirectory"
}

$utf8 = [System.Text.UTF8Encoding]::new($false)
$html = [System.IO.File]::ReadAllText($htmlPath, $utf8)
$text = [System.IO.File]::ReadAllText($textPath, $utf8)

function New-CfHtml([string]$htmlDocument) {
  $html = $htmlDocument
  $startMarker = "<!--StartFragment-->"
  $endMarker = "<!--EndFragment-->"

  if ($html.IndexOf($startMarker, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
      $html.IndexOf($endMarker, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    $html = "<html><body>$startMarker$html$endMarker</body></html>"
  }

  $prefixTemplate = "Version:1.0`r`nStartHTML:{0:0000000000}`r`nEndHTML:{1:0000000000}`r`nStartFragment:{2:0000000000}`r`nEndFragment:{3:0000000000}`r`n"
  $dummyPrefix = [string]::Format($prefixTemplate, 0, 0, 0, 0)
  $startHtml = [System.Text.Encoding]::UTF8.GetByteCount($dummyPrefix)
  $startFragment = $startHtml + [System.Text.Encoding]::UTF8.GetByteCount(
    $html.Substring(0, $html.IndexOf($startMarker, [StringComparison]::OrdinalIgnoreCase) + $startMarker.Length)
  )
  $endFragment = $startHtml + [System.Text.Encoding]::UTF8.GetByteCount(
    $html.Substring(0, $html.IndexOf($endMarker, [StringComparison]::OrdinalIgnoreCase))
  )
  $endHtml = $startHtml + [System.Text.Encoding]::UTF8.GetByteCount($html)
  $prefix = [string]::Format($prefixTemplate, $startHtml, $endHtml, $startFragment, $endFragment)
  return "$prefix$html"
}

$clipboardHtml = if ($html.StartsWith("Version:", [StringComparison]::OrdinalIgnoreCase)) {
  $html
} else {
  New-CfHtml $html
}

$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::Html, $clipboardHtml)
$data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $text)
$data.SetData([System.Windows.Forms.DataFormats]::Text, $text)

[System.Windows.Forms.Clipboard]::Clear()
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)

[ordered]@{
  inputDirectory = $absoluteDirectory
  htmlBytes = [System.Text.Encoding]::UTF8.GetByteCount($clipboardHtml)
  textCharacters = $text.Length
  math = ([regex]::Matches($clipboardHtml, "<math(?:\s|>)", "IgnoreCase")).Count
  texAnnotation = ([regex]::Matches($clipboardHtml, "application/x-tex", "IgnoreCase")).Count
  hasCfHtmlHeader = $clipboardHtml.StartsWith("Version:", [StringComparison]::OrdinalIgnoreCase)
  textPreview = $text.Substring(0, [Math]::Min(80, $text.Length))
} | ConvertTo-Json
