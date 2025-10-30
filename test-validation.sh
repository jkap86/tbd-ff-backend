#!/bin/bash

echo "Testing Input Validation..."
echo ""

BASE_URL="http://localhost:3000"

echo "Test 1: Weak password"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"weak"}' \
  | jq .

echo ""
echo "Test 2: Invalid email"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"not-email","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 3: Short username"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"ab","email":"test@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 4: Reserved username"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"test@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "Test 5: Valid registration (should succeed)"
curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"validuser","email":"valid@example.com","password":"Strong123"}' \
  | jq .

echo ""
echo "All tests complete!"
