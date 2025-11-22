#!/usr/bin/env python3
"""
Test FLOW-Native Execution on Docker Backend
"""
import requests
import json
import sys

# Use port 8080 (Docker backend)
BASE_URL = "http://localhost:8080"

def main():
    print("🧪 VOIKE FLOW-Native Test (Docker Backend)")
    print("=" * 50)
    print()
    
    # Check server
    print("🔍 Checking server on port 8080...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        if response.status_code == 200:
            print("✅ Server is running on port 8080")
        else:
            print(f"⚠️  Server responded with status {response.status_code}")
    except Exception as e:
        print(f"❌ Server not accessible: {e}")
        sys.exit(1)
    
    print()
    print("📊 Testing FLOW Operations...")
    print()
    
    # Test FLOW execution
    tests = [
        ("Grid Status", "grid.getJobStatus", {"jobId": "test-123"}),
        ("Blob List", "blob.list", {"prefix": "test", "limit": 10}),
    ]
    
    passed = 0
    failed = 0
    
    for name, operation, payload in tests:
        print(f"Testing: {name}... ", end="", flush=True)
        try:
            response = requests.post(
                f"{BASE_URL}/api/apx/execute",
                json={
                    "operation": operation,
                    "payload": payload,
                    "projectId": "test-project"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                print("✅ PASS")
                passed += 1
                result = response.json()
                print(f"  Result: {json.dumps(result, indent=2)[:100]}...")
            else:
                print("❌ FAIL")
                print(f"  Status: {response.status_code}")
                print(f"  Response: {response.text[:200]}")
                failed += 1
        except Exception as e:
            print("❌ FAIL")
            print(f"  Error: {e}")
            failed += 1
    
    print()
    print("=" * 50)
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print()
    
    if failed == 0:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
