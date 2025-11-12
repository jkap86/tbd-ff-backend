# Read the minified JSON file and escape it for command line
$minifiedJson = Get-Content -Raw firebase-minified.json
# Escape the JSON for shell - replace newlines with literal \n
$escapedJson = $minifiedJson -replace "`n", "" -replace "`r", ""
# Set it on Heroku using single quotes to avoid PowerShell expansion
heroku config:set FIREBASE_SERVICE_ACCOUNT="$escapedJson" --app tbd-ff
