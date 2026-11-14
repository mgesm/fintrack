$path = "C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html"
$lines = [System.IO.File]::ReadAllLines($path)

for ($i = 2590; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match '^function\s+([a-zA-Z0-9_]+)\s*\(') {
        $fn = $matches[1]
        if ($fn -match '(render|Modal|Tab|Tx|open|close|switch|Filter|Search|Account|Cat|Budget|Invest|Settings|Adjust|Export|Swipe)') {
            Write-Host "$($i + 1): $fn"
        }
    }
}
