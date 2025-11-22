#!/bin/bash
# Real-World FLOW Test - Using Server API

echo "🧪 VOIKE FLOW-Native Real-World Test"
echo "====================================="
echo ""

# Check if server is running
if ! lsof -i :3000 > /dev/null 2>&1; then
    echo "⚠️  Server not running on port 3000"
    echo "Starting server in background..."
    npm run dev > /dev/null 2>&1 &
    SERVER_PID=$!
    echo "Waiting for server to start..."
    sleep 5
else
    echo "✅ Server is running"
    SERVER_PID=""
fi
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

# Test function
test_operation() {
    local name=$1
    local operation=$2
    local payload=$3
    
    echo -n "Testing: $name... "
    
    response=$(curl -s -X POST http://localhost:3000/api/apx/execute \
        -H "Content-Type: application/json" \
        -d "{\"operation\":\"$operation\",\"payload\":$payload,\"projectId\":\"test-project\"}" 2>&1)
    
    if echo "$response" | grep -q "success\|result\|jobId"; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "  Response: $response"
        ((FAILED++))
    fi
}

# Run tests
echo "📊 Running FLOW-Native Tests..."
echo ""

test_operation "Grid Status" "grid.getJobStatus" '{"jobId":"test-123"}'
test_operation "Blob List" "blob.list" '{"prefix":"test","limit":10}'
test_operation "Edge Status" "edge.getStatus" '{}'

echo ""
echo "====================================="
echo "📈 Test Summary"
echo "====================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

# Cleanup
if [ -n "$SERVER_PID" ]; then
    echo "Stopping test server..."
    kill $SERVER_PID 2>/dev/null
fi

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed${NC}"
    exit 1
fi
