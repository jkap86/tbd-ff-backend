#!/bin/bash

echo "Testing Authorization..."
echo ""

BASE_URL="http://localhost:5000"

# Login as different users
echo "Logging in test users..."
TOKEN_COMM=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"commissioner","password":"TestPass123"}' \
  | jq -r .data.token)

TOKEN_MEMBER=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"member1","password":"TestPass123"}' \
  | jq -r .data.token)

echo "Tokens acquired"
echo ""

echo "Test 1: Commissioner can modify league settings"
curl -s -X PUT $BASE_URL/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_COMM" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}' \
  | jq .
echo ""

echo "Test 2: Non-commissioner CANNOT modify league settings"
curl -s -X PUT $BASE_URL/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"trade_deadline_week":10}}' \
  | jq .
echo ""

echo "Test 3: Member can view league"
curl -s $BASE_URL/api/leagues/1 \
  -H "Authorization: Bearer $TOKEN_MEMBER" \
  | jq '.success'
echo ""

echo "Test 4: Unauthenticated cannot view league"
curl -s $BASE_URL/api/leagues/1 | jq .
echo ""

echo "All tests complete!"
