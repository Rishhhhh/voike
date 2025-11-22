#!/usr/bin/env python3
"""
Simple FLOW Test - Verify FLOW-native execution via server API
"""
import requests
import json
import time
import sys

# Server URL
BASE_URL = "http://localhost:3000"

def test_server_health():
    """Test if server is running"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        return response.status_code == 200
    except:
        return False

def test_flow_execution(operation, payload, project_id="test-project"):
    """Test FLOW execution via APX"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/apx/execute",
            json={
                "operation": operation,
                "payload": payload,
                "projectId": project_id
            },
            timeout=10
        )
        return response.status_code == 200, response.json()
    except Exception as e:
        return False, str(e)

def main():
    print("🧪 VOIKE FLOW-Native Test Suite")
    print("=" * 50)
    print()
    
    # Check server
    print("🔍 Checking server status...")
    if not test_server_health():
        print("❌ Server not running on port 3000")
        print("   Start with: npm run dev")
        sys.exit(1)
    print("✅ Server is running")
    print()
    
    # Run tests
    tests = [
        ("Grid Status", "grid.getJobStatus", {"jobId": "test-123"}),
        ("Blob List", "blob.list", {"prefix": "test", "limit": 10}),
        ("Edge Status", "edge.getStatus", {}),
    ]
    
    passed = 0
    failed = 0
    
    print("📊 Running FLOW Tests...")
    print()
    
    for name, operation, payload in tests:
        print(f"Testing: {name}... ", end="", flush=True)
        success, result = test_flow_execution(operation, payload)
        
        if success:
            print("✅ PASS")
            passed += 1
        else:
            print("❌ FAIL")
            print(f"  Error: {result}")
            failed += 1
    
    print()
    print("=" * 50)
    print("📈 Test Summary")
    print("=" * 50)
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Total: {passed + failed}")
    print()
    
    if failed == 0:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
