#!/bin/bash
# VOIKE FLOW-Native Real-World Test Suite

echo "🧪 VOIKE FLOW-Native Test Suite"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to run test
run_test() {
    local test_name=$1
    local flow_file=$2
    local inputs=$3
    
    echo -n "Testing: $test_name... "
    
    # Run FLOW
    result=$(voike run "$flow_file" --input "$inputs" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
        echo "  Result: $result"
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
        echo "  Error: $result"
    fi
    echo ""
}

# Test 1: Grid Compute
echo "📊 Test 1: Grid Compute Service"
run_test "Grid Job Submission" \
    "flows/lib/grid/compute.flow" \
    '{"operation":"status","config":{},"projectId":"test-project"}'

# Test 2: Blob Storage
echo "💾 Test 2: Blob Storage Service"
run_test "Blob List Operation" \
    "flows/lib/storage/blob.flow" \
    '{"operation":"list","blobConfig":{"prefix":"test","limit":10},"projectId":"test-project"}'

# Test 3: AI Service
echo "🤖 Test 3: AI Service"
run_test "AI Inference" \
    "flows/lib/ai/service.flow" \
    '{"operation":"infer","aiConfig":{"input":"test","parameters":{}},"projectId":"test-project"}'

# Test 4: Edge Compute
echo "🌐 Test 4: Edge Compute Service"
run_test "Edge Status" \
    "flows/lib/edge/compute.flow" \
    '{"operation":"status","edgeConfig":{},"projectId":"test-project"}'

# Test 5: Orchestrator
echo "🎯 Test 5: Orchestrator Service"
run_test "List Tasks" \
    "flows/lib/orchestration/service.flow" \
    '{"operation":"listTasks","config":{"limit":10},"projectId":"test-project"}'

# Summary
echo "================================"
echo "📈 Test Summary"
echo "================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed${NC}"
    exit 1
fi
