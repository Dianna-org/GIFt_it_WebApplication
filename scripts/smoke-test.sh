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
body() { echo "{\"title\":\"$1\",\"cardSize\":\"a4\",\"background\":\"#fde9a0\",\"image\":\"$PNG\",\"thumbnail\":\"data:image/jpeg;base64,AAAA\",\"texts\":[\"$2\"],\"layers\":{\"inInk\":\"$PNG\",\"cut\":\"$PNG\"}}"; }
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"; }

echo "Health"
check "api is up" '"ok"' "$(curl -s "$BASE/health")"

echo "Accounts"
check "under 14 rejected"       "at least 14" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"kid$uniq@t.io\",\"displayName\":\"Kid\",\"password\":\"password1\",\"birthDate\":\"$(( $(date +%Y) - 12 ))-01-01\"}")"
check "profane name rejected"   "different display name" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"p$uniq@t.io\",\"displayName\":\"fuck\",\"password\":\"password1\",\"birthDate\":\"2000-01-01\"}")"
R="$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"displayName\":\"Smoke\",\"password\":\"password1\",\"birthDate\":\"2000-01-01\"}")"
check "adult can register"      '"token"' "$R"
T="$(echo "$R" | tok)"
check "duplicate email rejected" "already exists" "$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"displayName\":\"Smoke\",\"password\":\"password1\",\"birthDate\":\"2000-01-01\"}")"
check "wrong password rejected"  "Incorrect" "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"password\":\"nope\"}")"
check "login works"              '"token"' "$(curl -s -X POST "$BASE/auth/login" -H "$H" -d "{\"email\":\"u$uniq@t.io\",\"password\":\"password1\"}")"

echo "Portfolio"
AUTH="Authorization: Bearer $T"
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
check "saving again reuses slot" '"id"' "$(curl -s -X PUT "$BASE/designs/$ID" -H "$H" -H "$AUTH" -d "$(body renamed hello)")"
check "still one slot used"      '"id":"'"$ID"'"' "$(curl -s "$BASE/designs" -H "$AUTH")"
for i in $(seq 2 20); do curl -s -o /dev/null -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body d$i hi)"; done
check "21st design refused"      "portfolio is full" "$(curl -s -X POST "$BASE/designs" -H "$H" -H "$AUTH" -d "$(body over hi)")"
R2="$(curl -s -X POST "$BASE/auth/register" -H "$H" -d "{\"email\":\"o$uniq@t.io\",\"displayName\":\"Other\",\"password\":\"password1\",\"birthDate\":\"1999-01-01\"}")"
check "portfolio is private"     "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/designs/$ID" -H "Authorization: Bearer $(echo "$R2" | tok)")"
check "delete frees a slot"      "204" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/designs/$ID" -H "$AUTH")"

[[ $fail -eq 0 ]] && echo "All smoke tests passed." || { echo "Some smoke tests FAILED."; exit 1; }
