$json = Get-Content firebase-service-account.json.json -Raw
$escapedJson = $json.Replace('"', '\"').Replace("`n", "\n")
heroku config:set "FIREBASE_SERVICE_ACCOUNT=$json" --app tbd-ff
