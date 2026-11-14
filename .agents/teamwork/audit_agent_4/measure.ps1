$content = [System.IO.File]::ReadAllText('C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html')

# 1. Inline event handlers (onclick, oninput, onchange, etc.)
$inlineEvents = [regex]::Matches($content, 'on[a-z]+="[^"]*"')
Write-Host "Total inline event handlers in markup/template strings: $($inlineEvents.Count)"

$byType = @{}
foreach ($ev in $inlineEvents) {
    $name = [regex]::Match($ev.Value, '^on([a-z]+)=').Groups[1].Value
    if (!$byType.ContainsKey($name)) { $byType[$name] = 0 }
    $byType[$name]++
}
foreach ($k in $byType.Keys) {
    Write-Host "  on$k : $($byType[$k])"
}

# 2. AddEventListener calls
$addListeners = [regex]::Matches($content, 'addEventListener\(\s*''([a-z]+)''')
Write-Host "`nTotal addEventListener calls: $($addListeners.Count)"
$alByType = @{}
foreach ($al in $addListeners) {
    $name = $al.Groups[1].Value
    if (!$alByType.ContainsKey($name)) { $alByType[$name] = 0 }
    $alByType[$name]++
}
foreach ($k in $alByType.Keys) {
    Write-Host "  $k : $($alByType[$k])"
}

# 3. InnerHTML assignments
$innerHtmls = [regex]::Matches($content, '\.innerHTML\s*=')
Write-Host "`nTotal .innerHTML assignments: $($innerHtmls.Count)"

# 4. QuerySelector/All calls
$qs = [regex]::Matches($content, '\.querySelector\(')
$qsa = [regex]::Matches($content, '\.querySelectorAll\(')
$byId = [regex]::Matches($content, 'getElementById\(')
Write-Host "`nDOM Query lookups:"
Write-Host "  getElementById: $($byId.Count)"
Write-Host "  querySelector: $($qs.Count)"
Write-Host "  querySelectorAll: $($qsa.Count)"

# 5. Date allocations / formatting
$newDate = [regex]::Matches($content, 'new Date\(')
$locDate = [regex]::Matches($content, 'toLocaleDateString\(')
Write-Host "`nDate operations:"
Write-Host "  new Date(): $($newDate.Count)"
Write-Host "  toLocaleDateString(): $($locDate.Count)"

# 6. JSON parse / stringify
$jp = [regex]::Matches($content, 'JSON\.parse\(')
$js = [regex]::Matches($content, 'JSON\.stringify\(')
Write-Host "`nJSON operations:"
Write-Host "  JSON.parse(): $($jp.Count)"
Write-Host "  JSON.stringify(): $($js.Count)"
