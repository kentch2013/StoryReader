if ($PSScriptRoot) { Set-Location $PSScriptRoot }
try { $host.UI.RawUI.WindowTitle = "StoryReader Server" } catch {}

node scripts/prelaunch.js
node server.js
