param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [Parameter(Mandatory = $true)]
  [string]$Condition,
  [string]$CopyPath = "selection"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

function Get-Sha256([string]$value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "")
  } finally {
    $sha.Dispose()
  }
}

function Get-CfHtmlOffset([string]$html, [string]$name) {
  $match = [regex]::Match($html, "(?m)^$name`:(\d+)$")
  if ($match.Success) { return [int64]$match.Groups[1].Value }
  return $null
}

$absoluteDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path (Get-Location) $OutputDirectory)
)
New-Item -ItemType Directory -Force -Path $absoluteDirectory | Out-Null

$data = [System.Windows.Forms.Clipboard]::GetDataObject()
$formats = @($data.GetFormats())
$html = [string]($data.GetData([System.Windows.Forms.DataFormats]::Html))
$text = [string]($data.GetData([System.Windows.Forms.DataFormats]::UnicodeText))
if (-not $text) { $text = [System.Windows.Forms.Clipboard]::GetText() }

$htmlPath = Join-Path $absoluteDirectory "clipboard.html"
$textPath = Join-Path $absoluteDirectory "clipboard.txt"
$jsonPath = Join-Path $absoluteDirectory "clipboard.json"
[System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($textPath, $text, [System.Text.UTF8Encoding]::new($false))

$startHtml = Get-CfHtmlOffset $html "StartHTML"
$endHtml = Get-CfHtmlOffset $html "EndHTML"
$startFragment = Get-CfHtmlOffset $html "StartFragment"
$endFragment = Get-CfHtmlOffset $html "EndFragment"
$htmlBytes = [System.Text.Encoding]::UTF8.GetByteCount($html)
$offsetsValid = $null -ne $startHtml -and $null -ne $endHtml `
  -and $null -ne $startFragment -and $null -ne $endFragment `
  -and 0 -le $startHtml -and $startHtml -le $startFragment `
  -and $startFragment -le $endFragment -and $endFragment -le $endHtml `
  -and $endHtml -le $htmlBytes

$result = [ordered]@{
  condition = $Condition
  copyPath = $CopyPath
  timestampUtc = [DateTime]::UtcNow.ToString("o")
  formats = $formats
  htmlBytes = $htmlBytes
  textCharacters = $text.Length
  htmlSha256 = Get-Sha256 $html
  textSha256 = Get-Sha256 $text
  cfHtml = [ordered]@{
    startHtml = $startHtml
    endHtml = $endHtml
    startFragment = $startFragment
    endFragment = $endFragment
    offsetsValid = $offsetsValid
  }
  counts = [ordered]@{
    math = ([regex]::Matches($html, "<math(?:\s|>)", "IgnoreCase")).Count
    texAnnotation = ([regex]::Matches($html, "application/x-tex", "IgnoreCase")).Count
    katexHtml = ([regex]::Matches($html, "katex-html", "IgnoreCase")).Count
    image = ([regex]::Matches($html, "<img(?:\s|>)", "IgnoreCase")).Count
    script = ([regex]::Matches($html, "<script(?:\s|>)", "IgnoreCase")).Count
    inlineEvent = ([regex]::Matches($html, "\son[a-z]+\s*=", "IgnoreCase")).Count
    extensionControl = ([regex]::Matches($html, "chat-export|data-chat-export", "IgnoreCase")).Count
  }
}

$json = $result | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($jsonPath, $json, [System.Text.UTF8Encoding]::new($false))
$json
