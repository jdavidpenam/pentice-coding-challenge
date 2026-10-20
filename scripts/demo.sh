#!/usr/bin/env bash
# Demo sequence against a running API started with DEV_TOOLS=true. Usage: BASE=http://127.0.0.1:3000/api ./demo.sh
set -u
BASE="${BASE:-http://127.0.0.1:3000/api}"
req() { # method path user [body] [extra header]
  local m=$1 p=$2 u=$3 b=${4:-} h=${5:-}
  local args=(-s -X "$m" "$BASE$p" -H 'Content-Type: application/json')
  [ -n "$u" ] && args+=(-H "X-Demo-User-Id: $u")
  [ -n "$h" ] && args+=(-H "$h")
  [ -n "$b" ] && args+=(-d "$b")
  curl "${args[@]}" -w ' [HTTP %{http_code}]'; echo
}
say() { printf '\n== %s\n' "$*"; }
USERS=$(curl -s "$BASE/users")
id() { echo "$USERS" | jq -r ".[] | select(.name==\"$1\") | .id"; }
ALICE=$(id Alice); BOB=$(id Bob)
say "1. Create a user (Dana) and open a second account"
D=$(curl -s -X POST "$BASE/users" -H 'Content-Type: application/json' -d '{"name":"Dana"}'); echo "$D"
DANA=$(echo "$D" | jq -r '.id // .user.id')
req POST /accounts "$DANA" '{"name":"Rainy day"}'
ACC() { curl -s "$BASE/accounts" -H "X-Demo-User-Id: $1" | jq -r ".[] | select(.name==\"$2\") | .id"; }
A_MAIN=$(ACC "$ALICE" Main); A_SAV=$(ACC "$ALICE" Savings); B_MAIN=$(ACC "$BOB" Main); D_MAIN=$(ACC "$DANA" Main)
say "2a. Alice: Main -> Savings (own accounts) 10.00"
req POST /transfers "$ALICE" "{\"fromAccountId\":\"$A_MAIN\",\"toAccountId\":\"$A_SAV\",\"amountMinor\":1000}"
say "2b. Alice -> Bob (another user) 25.00"
req POST /transfers "$ALICE" "{\"fromAccountId\":\"$A_MAIN\",\"toAccountId\":\"$B_MAIN\",\"amountMinor\":2500}"
say "3. Insufficient funds: Dana (empty) -> Bob 1.00"
req POST /transfers "$DANA" "{\"fromAccountId\":\"$D_MAIN\",\"toAccountId\":\"$B_MAIN\",\"amountMinor\":100}"
say "4. Unauthorized debit: acting as Bob, debit Alice's Main"
req POST /transfers "$BOB" "{\"fromAccountId\":\"$A_MAIN\",\"toAccountId\":\"$B_MAIN\",\"amountMinor\":100}"
say "   (Alice's balance unchanged:)"; req GET /accounts "$ALICE"
say "5. Simulated payment (approve) 40.00"
curl -s -X POST "$BASE/dev/provider/mode" -H 'Content-Type: application/json' -d '{"mode":"approve"}' >/dev/null
req POST /payments "$ALICE" "{\"accountId\":\"$A_MAIN\",\"amountMinor\":4000,\"reference\":\"room-101\"}" 'Idempotency-Key: demo-approve-0001'
say "6a. charge_then_timeout 50.00 -> UNKNOWN, funds reserved"
curl -s -X POST "$BASE/dev/provider/mode" -H 'Content-Type: application/json' -d '{"mode":"charge_then_timeout"}' >/dev/null
R=$(req POST /payments "$ALICE" "{\"accountId\":\"$A_MAIN\",\"amountMinor\":5000,\"reference\":\"room-202\"}" 'Idempotency-Key: demo-timeout-0002'); echo "$R"
PID=$(echo "$R" | sed 's/ \[HTTP.*//' | jq -r '.id // .payment.id')
req GET /accounts "$ALICE"
say "6b. Safe retry with the same key (no second charge)"
req POST /payments "$ALICE" "{\"accountId\":\"$A_MAIN\",\"amountMinor\":5000,\"reference\":\"room-202\"}" 'Idempotency-Key: demo-timeout-0002'
say "6c. Same key, different amount -> 409"
req POST /payments "$ALICE" "{\"accountId\":\"$A_MAIN\",\"amountMinor\":5100,\"reference\":\"room-202\"}" 'Idempotency-Key: demo-timeout-0002'
say "6d. Reconcile (idempotent)"
req POST "/payments/$PID/reconcile" "$ALICE"
req GET /accounts "$ALICE"
curl -s -X POST "$BASE/dev/provider/mode" -H 'Content-Type: application/json' -d '{"mode":"approve"}' >/dev/null
