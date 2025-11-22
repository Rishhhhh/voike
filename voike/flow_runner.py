"""
FlowRunner - Executes FLOW files via VOIKE API
"""
import os
import json
import requests
from typing import Dict, Any, Optional


class FlowRunner:
    def __init__(self, base_url: str = None, api_key: str = None):
        self.base_url = base_url or os.getenv("VOIKE_BASE_URL", "http://localhost:8081")
        self.api_key = api_key or os.getenv("VOIKE_API_KEY") or os.getenv("PLAYGROUND_API_KEY")
        
        if not self.api_key:
            raise ValueError(
                "API key required. Set VOIKE_API_KEY or PLAYGROUND_API_KEY environment variable, "
                "or pass api_key parameter"
            )
    
    def run_flow(self, flow_path: str, inputs: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute a FLOW file and return results"""
        
        # Read flow source
        if not os.path.exists(flow_path):
            raise FileNotFoundError(f"Flow not found: {flow_path}")
        
        with open(flow_path, 'r') as f:
            flow_source = f.read()
        
        # Plan the flow
        plan_response = requests.post(
            f"{self.base_url}/flow/plan",
            headers={
                "x-voike-api-key": self.api_key,
                "content-type": "application/json"
            },
            json={"source": flow_source}
        )
        
        if plan_response.status_code != 200:
            raise Exception(f"Flow planning failed: {plan_response.text}")
        
        plan_data = plan_response.json()
        plan_id = plan_data.get("id")
        
        # Execute the flow
        exec_response = requests.post(
            f"{self.base_url}/flow/execute",
            headers={
                "x-voike-api-key": self.api_key,
                "content-type": "application/json"
            },
            json={
                "planId": plan_id,
                "inputs": inputs or {},
                "mode": "sync"
            }
        )
        
        if exec_response.status_code != 200:
            raise Exception(f"Flow execution failed: {exec_response.text}")
        
        return exec_response.json()
    
    def run_flow_from_source(self, source: str, inputs: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute FLOW source code directly"""
        
        # Plan the flow
        plan_response = requests.post(
            f"{self.base_url}/flow/plan",
            headers={
                "x-voike-api-key": self.api_key,
                "content-type": "application/json"
            },
            json={"source": source}
        )
        
        if plan_response.status_code != 200:
            raise Exception(f"Flow planning failed: {plan_response.text}")
        
        plan_data = plan_response.json()
        plan_id = plan_data.get("id")
        
        # Execute the flow
        exec_response = requests.post(
            f"{self.base_url}/flow/execute",
            headers={
                "x-voike-api-key": self.api_key,
                "content-type": "application/json"
            },
            json={
                "planId": plan_id,
                "inputs": inputs or {},
                "mode": "sync"
            }
        )
        
        if exec_response.status_code != 200:
            raise Exception(f"Flow execution failed: {exec_response.text}")
        
        return exec_response.json()
