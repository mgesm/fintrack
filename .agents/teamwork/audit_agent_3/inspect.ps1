$path = "C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html"
$lines = [System.IO.File]::ReadAllLines($path)
Write-Host "Total lines: $($lines.Length)"

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match '<(style|/style|body|/head|<nav|<header|/header|<main|script|/script|/body)') {
        Write-Host "$($i + 1): $($line.Trim())"
    }
}
