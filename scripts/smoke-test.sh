#!/usr/bin/env bash
# End-to-end API checks against a running stack (docker compose up -d).
# Usage: scripts/smoke-test.sh [base-url]     (default http://localhost:3000)
set -u
BASE="${1:-http://localhost:${WEB_PORT:-3000}}/api"
H='Content-Type: application/json'
fail=0
check() { # name expected actual
  if [[ "$3" == *"$2"* ]]; then echo "  ok   $1"; else echo "  FAIL $1 (wanted '$2', got '$3')"; fail=1; fi
}
uniq="$(date +%s)$RANDOM"
PNG='data:image/png;base64,iVBORw0KGgo='
PW='purple-otter-banjo-42' # a password that passes the round 44 rules
body() { echo "{\"title\":\"$1\",\"cardSize\":\"a4\",\"background\":\"#fde9a0\",\"image\":\"$PNG\",\"thumbnail\":\"data:image/jpeg;base64,AAAA\",\"texts\":[\"$2\"],\"layers\":{\"inInk\":\"$PNG\",\"cut\":\"$PNG\"}}"; }
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"; }

echo "Health"
check "api is up" '"ok"' "$(curl -s "$BASE/health")"

echo "Accounts"
check "under 14 rejected"       "at least 14" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"kid$uniq@t.io\",\"displayName\":\"Kid\",\"password\":\"$PW\",\"birthDate\":\"$(( $(date +%Y) - 12 ))-01-01\"}")"
check "profane name rejected"   "different display name" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"p$uniq@t.io\",\"displayName\":\"fuck\",\"password\":\"$PW\",\"birthDate\":\"2000-01-01\"}")"
R="$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"displayName\":\"Smoke\",\"password\":\"$PW\",\"birthDate\":\"2000-01-01\"}")"
check "adult can register"      '"token"' "$R"
T="$(echo "$R" | tok)"
check "duplicate email rejected" "already exists" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"displayName\":\"Smoke\",\"password\":\"$PW\",\"birthDate\":\"2000-01-01\"}")"
check "wrong password rejected"  "Incorrect" "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"password\":\"nope\"}")"
check "login works"              '"token"' "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"password\":\"$PW\"}")"

echo "Portfolio"
AUTH="Authorization: Bearer $T"
check "profile photo saved"       '"avatar":"data:image/png' "$(curl -s -X PUT "$BASE/account/avatar" -H "$H" -H "$AUTH" -d "{\"avatar\":\"$PNG\"}")"
check "photo comes with login"    '"avatar":"data:image/png' "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"password\":\"$PW\"}")"
check "bad photo refused"         "JPEG or PNG" "$(curl -s -X PUT "$BASE/account/avatar" -H "$H" -H "$AUTH" -d '{"avatar":"javascript:alert(1)"}')"
check "photo can be removed"      '"avatar":""' "$(curl -s -X PUT "$BASE/account/avatar" -H "$H" -H "$AUTH" -d '{"avatar":""}')"
check "photo needs a login"       "401" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/account/avatar" -H "$H" -d '{"avatar":""}')"
check "needs a token"            "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/designs")"
check "profane text is blocked"  "aren't allowed" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body t 'what the fuck')")"
C="$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body first hello)")"
check "design saved"             '"id"' "$C"
check "bad palette refused"      "Invalid colour palette" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "Authorization: Bearer $T" -d "{\"cardSize\":\"a4\",\"background\":\"#fff\",\"image\":\"$PNG\",\"thumbnail\":\"data:image/jpeg;base64,AA\",\"palette\":[\"red\"]}")"
check "bad layer name refused"   "Invalid layer" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "Authorization: Bearer $T" -d "{\"cardSize\":\"a4\",\"background\":\"#fff\",\"image\":\"$PNG\",\"thumbnail\":\"data:image/jpeg;base64,AA\",\"layers\":{\"evil\":\"x\"}}")"
ID="$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")"
SHAPE='{"face":"inside","id":"s1","kind":"heart","x":300,"y":200,"w":180,"h":160,"rot":0.3,"color":"#e63946","width":8}'
check "shapes are saved"         '"id"' "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body withshape hi | sed "s/}}\$/},\"shapes\":[$SHAPE]}/")")"
check "shapes come back"         '"kind":"heart"' "$(curl -s "$BASE/designs/$ID" -H "$AUTH")"
check "bad shape refused"        "Invalid shape" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body bad hi | sed 's/}}$/},"shapes":[{"face":"top","kind":"x","w":1,"h":1,"color":"#000000","width":5}]}/')")"
TBOX='{"face":"inside","id":"t1","kind":"text","x":400,"y":300,"w":300,"h":90,"rot":0.2,"color":"#1d4ed8","width":8,"text":"Happy birthday","family":"Georgia, \\"Times New Roman\\", serif","size":60,"bold":true,"italic":false,"align":"justify","underline":true,"strike":false,"list":"number","letterSpacing":0.1,"lineSpacing":1.5}'
check "text box saved"           '"id"' "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body withtext hi | sed "s/}}\$/},\"shapes\":[$TBOX]}/")")"
check "text box comes back"      '"text":"Happy birthday"' "$(curl -s "$BASE/designs/$ID" -H "$AUTH")"
check "text formatting saved"    '"list":"number"' "$(curl -s "$BASE/designs/$ID" -H "$AUTH")"
check "bad text alignment refused" "Invalid shape" "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body withtext hi | sed "s/}}\$/},\"shapes\":[${TBOX/justify/diagonal}]}/")")"
check "profane text box refused" "Invalid shape" "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body withtext hi | sed "s/}}\$/},\"shapes\":[${TBOX/Happy birthday/what the fuck}]}/")")"
check "saving again reuses slot" '"id"' "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body renamed hello)")"
check "still one slot used"      '"id":"'"$ID"'"' "$(curl -s "$BASE/designs" -H "$AUTH")"
for i in $(seq 2 20); do curl -s -o /dev/null -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body d$i hi)"; done
check "21st design refused"      "portfolio is full" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body over hi)")"
R2="$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"o$uniq@t.io\",\"displayName\":\"Other\",\"password\":\"$PW\",\"birthDate\":\"1999-01-01\"}")"
check "portfolio is private"     "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/designs/$ID" -H "Authorization: Bearer $(echo "$R2" | tok)")"
check "delete frees a slot"      "204" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/designs/$ID" -H "$AUTH")"

echo "Gift shop"
AUTH2="Authorization: Bearer $(echo "$R2" | tok)"
check "shop lists items"           '"paper-all"' "$(curl -s "$BASE/shop")"
check "shop sells calligraphy pen"  '"id":"tool-calligraphy","kind":"tool","price":200' "$(curl -s "$BASE/shop")"
check "shop sells spray can"       '"id":"tool-spray","kind":"tool","price":200' "$(curl -s "$BASE/shop")"
check "100 welcome points"         '"points":100' "$(curl -s "$BASE/account" -H "$AUTH2")"
check "unknown item refused"       "isn't in the shop" "$(curl -s -X POST "$BASE/shop/buy" -H "$H" -H "$AUTH2" -d '{"itemId":"free-points"}')"
check "too expensive refused"      "Not enough gift points" "$(curl -s -X POST "$BASE/shop/buy" -H "$H" -H "$AUTH2" -d '{"itemId":"paper-all"}')"
check "buying works"               '"points":40,"owned":["paper-red"]' "$(curl -s -X POST "$BASE/shop/buy" -H "$H" -H "$AUTH2" -d '{"itemId":"paper-red"}')"
check "can't buy twice"            "already have" "$(curl -s -X POST "$BASE/shop/buy" -H "$H" -H "$AUTH2" -d '{"itemId":"paper-red"}')"
check "buying needs a login"       "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/shop/buy" -H "$H" -d '{"itemId":"paper-red"}')"
EMPTY="{\"cardSize\":\"a4\",\"background\":\"#fff\",\"image\":\"$PNG\",\"thumbnail\":\"data:image/jpeg;base64,AA\",\"layers\":{}}"
E="$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH2" -d "$EMPTY")"
check "saving answers no points"   '"updatedAt"' "$E"
EID="$(echo "$E" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")"
check "saving gives no points"     '"points":40' "$(curl -s -X PUT "$BASE/designs/$EID" -H "$H" -H "$AUTH2" -d "$(body later hi)" >/dev/null; curl -s "$BASE/account" -H "$AUTH2")"
DL() { curl -s -X POST "$BASE/points/download" -H "$H" -H "$AUTH2" -d "{\"cardKey\":\"$1\",\"kind\":\"$2\"}"; }
check "download earns 50 points"   '"pointsEarned":50,"points":90' "$(DL "card-$uniq" picture)"
check "same card again: no more"   '"pointsEarned":0' "$(DL "card-$uniq" gif)"
check "bad card key refused"       "Unknown card" "$(DL "NOPE" picture)"
check "old saved card counts once" '"pointsEarned":50' "$(DL "d-$EID" gif)"
check "download needs a login"     "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/points/download" -H "$H" -d '{"cardKey":"abcdefgh12","kind":"gif"}')"
check "paper colour saved"         '"paperColor":"#e5484d"' "$(curl -s -X PUT "$BASE/designs/$EID" -H "$H" -H "$AUTH2" -d "$(body red hi | sed 's/}}$/},"paperColor":"#e5484d"}/')" >/dev/null; curl -s "$BASE/designs/$EID" -H "$AUTH2")"
check "bad paper colour refused"   "Invalid paper colour" "$(curl -s -X PUT "$BASE/designs/$EID" -H "$H" -H "$AUTH2" -d "$(body red hi | sed 's/}}$/},"paperColor":"red"}/')")"

echo "Security (round 44)"
reg() { curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"$1$uniq@t.io\",\"displayName\":\"Sec\",\"password\":\"$2\",\"birthDate\":\"2000-01-01\"}"; }
check "short password refused"     "at least 10" "$(reg w1 short123)"
check "common password refused"    "too easy" "$(reg w2 password123)"
LK="$(reg lock "$PW")"
check "argon2id + salt in database" '$argon2id$v=19$m=65536,t=3,p=1$' "$(docker compose exec -T mongo mongosh birthdaycards --quiet --eval "db.users.findOne({Email:'lock$uniq@t.io'}).PasswordHash" 2>&1)"
BAD() { curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"lock$uniq@t.io\",\"password\":\"wrong-$1\"}"; }
for i in 1 2 3 4; do BAD $i > /dev/null; done
check "5th wrong password locks"   "Too many wrong passwords" "$(BAD 5)"
check "locked even with right one" "Too many wrong passwords" "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"lock$uniq@t.io\",\"password\":\"$PW\"}")"
check "token from elsewhere refused" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/account" -H "Authorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.")"
HD="$(curl -sI "${BASE%/api}/")"
check "content security policy"    "Content-Security-Policy: default-src 'self'" "$HD"
check "no nginx version shown"     "Server: nginx"$'\r' "$HD"
LT="$(echo "$LK" | tok)"
docker compose exec -T mongo mongosh birthdaycards --quiet --eval "db.users.updateOne({Email:'lock$uniq@t.io'},{\$set:{LastActiveAt:new Date(Date.now()-31*864e5)}})" > /dev/null
check "points expire after 30 days" '"points":0,' "$(curl -s "$BASE/account" -H "Authorization: Bearer $LT")"
check "…and it is said once"        '"expiredPoints":100' "$(docker compose exec -T mongo mongosh birthdaycards --quiet --eval "db.users.updateOne({Email:'lock$uniq@t.io'},{\$set:{LastActiveAt:new Date(Date.now()-31*864e5),Points:100}})" > /dev/null; curl -s "$BASE/account" -H "Authorization: Bearer $LT")"
check "…not twice"                  '"expiredPoints":0' "$(curl -s "$BASE/account" -H "Authorization: Bearer $LT")"

[[ $fail -eq 0 ]] && echo "All smoke tests passed." || { echo "Some smoke tests FAILED."; exit 1; }
