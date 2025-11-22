#!/bin/bash
# Quick FLOW Test - Verify FLOW-Native Execution

echo "🧪 VOIKE FLOW-Native Quick Test"
echo "==============================="
echo ""

# Test 1: Simple FLOW parse test
echo "📝 Test 1: FLOW File Parsing"
if [ -f "flows/lib/grid/compute.flow" ]; then
    echo "✅ FLOW file exists: flows/lib/grid/compute.flow"
    head -5 flows/lib/grid/compute.flow
else
    echo "❌ FLOW file not found"
    exit 1
fi
echo ""

# Test 2: Check FLOW executor
echo "🔧 Test 2: FLOW Executor Check"
if [ -f "src/flow/flowNativeExecutor.ts" ]; then
    echo "✅ FLOW executor exists"
    grep -c "FLOW_ROUTE_MAP" src/flow/flowNativeExecutor.ts
    echo " operation mappings found"
else
    echo "❌ FLOW executor not found"
    exit 1
fi
echo ""

# Test 3: Count FLOW files
echo "📊 Test 3: FLOW Library Count"
FLOW_COUNT=$(find flows/lib -name "*.flow" | wc -l | tr -d ' ')
echo "✅ Found $FLOW_COUNT FLOW files"
if [ "$FLOW_COUNT" -eq "32" ]; then
    echo "✅ All 32 services converted!"
else
    echo "⚠️  Expected 32, found $FLOW_COUNT"
fi
echo ""

# Test 4: Check build
echo "🏗️  Test 4: Build Status"
if [ -d "dist" ]; then
    echo "✅ Build directory exists"
    ls -la dist/ | head -5
else
    echo "⚠️  Build directory not found (run: npm run build)"
fi
echo ""

# Test 5: Server status
echo "🚀 Test 5: Server Status"
if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ Server is running on port 3000"
else
    echo "⚠️  Server not running (run: npm run dev)"
fi
echo ""

echo "==============================="
echo "✅ Quick test complete!"
echo ""
echo "Next steps:"
echo "1. Start server: npm run dev"
echo "2. Watch logs: tail -f logs/voike.log | grep FLOW"
echo "3. Test API: curl http://localhost:3000/health"
