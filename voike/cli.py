import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import requests


CONFIG_DIR = Path.home() / ".voike"
CONFIG_PATH = CONFIG_DIR / "config.json"


def load_config() -> Dict[str, Optional[str]]:
  base_url = os.environ.get("VOIKE_BASE_URL", "http://localhost:8080")
  api_key = os.environ.get("VOIKE_API_KEY")
  project_id = None

  if CONFIG_PATH.exists():
    try:
      raw = json.loads(CONFIG_PATH.read_text())
      base_url = raw.get("baseUrl") or base_url
      api_key = raw.get("apiKey") or api_key
      project_id = raw.get("projectId") or project_id
    except Exception:
      # Best-effort: fall back to env/defaults if config is malformed.
      pass

  return {"baseUrl": base_url, "apiKey": api_key, "projectId": project_id}


def http_request(
  method: str,
  path: str,
  *,
  body: Optional[Dict[str, Any]] = None,
  headers: Optional[Dict[str, str]] = None,
  auth_required: bool = True,
) -> Any:
  config = load_config()
  base_url = config["baseUrl"]
  api_key = config["apiKey"]

  url = f"{base_url}{path}"
  req_headers: Dict[str, str] = {"content-type": "application/json"}
  if headers:
    req_headers.update(headers)
  if auth_required and api_key:
    req_headers.setdefault("x-voike-api-key", api_key)

  resp = requests.request(
    method,
    url,
    headers=req_headers,
    json=body,
    timeout=60,
  )
  if not resp.ok:
    raise SystemExit(f"HTTP {resp.status_code}: {resp.text}")
  if resp.status_code == 204 or not resp.text:
    return None
  try:
    return resp.json()
  except Exception:
    return resp.text


def cmd_flow_parse(args: argparse.Namespace) -> None:
  source = Path(args.file).read_text(encoding="utf-8")
  result = http_request(
    "POST",
    "/flow/parse",
    body={"source": source},
  )
  if args.json:
    print(json.dumps(result, indent=2))
    return
  ok = bool(result.get("ok"))
  warnings = result.get("warnings") or []
  print("FLOW parse ok" if ok else "FLOW parse completed with warnings")
  if warnings:
    print("Warnings:", json.dumps(warnings, indent=2))


def _read_flow_source(path_str: str) -> str:
  path = Path(path_str)
  if path.is_file():
    return path.read_text(encoding="utf-8")

  # Fallback to flows/ subdirectory to mirror Node CLI behavior.
  from_flows = Path.cwd() / "flows" / path_str
  if from_flows.is_file():
    return from_flows.read_text(encoding="utf-8")

  raise SystemExit(f"FLOW file not found: {path_str}")


def cmd_flow_plan(args: argparse.Namespace) -> None:
  source = _read_flow_source(args.file)
  result = http_request(
    "POST",
    "/flow/plan",
    body={"source": source},
  )
  plan_id = result.get("id")
  print(plan_id or result)


def _execute_flow_from_source(source: str, mode: str) -> Any:
  plan = http_request(
    "POST",
    "/flow/plan",
    body={"source": source},
  )
  plan_id = plan.get("id")
  if not plan_id:
    raise SystemExit(f"Unexpected /flow/plan response: {plan}")

  cfg = load_config()
  body: Dict[str, Any] = {"planId": plan_id, "mode": mode}
  if cfg.get("projectId"):
    body["inputs"] = {"projectId": cfg["projectId"]}
  return http_request(
    "POST",
    "/flow/execute",
    body=body,
  )


def cmd_flow_run(args: argparse.Namespace) -> None:
  source = _read_flow_source(args.file)
  result = _execute_flow_from_source(source, args.mode)
  print(json.dumps(result, indent=2))


def cmd_project_create(org: str, project: str, key_label: str) -> None:
  admin_token = os.environ.get("VOIKE_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
  if not admin_token:
    raise SystemExit(
      "VOIKE_ADMIN_TOKEN (or ADMIN_TOKEN) must be set to create projects via /admin/projects.",
    )

  result = http_request(
    "POST",
    "/admin/projects",
    headers={"x-voike-admin-token": admin_token},
    body={
      "organizationName": org,
      "projectName": project,
      "keyLabel": key_label,
    },
    auth_required=False,
  )

  organization = result.get("organization") or {}
  project_obj = result.get("project") or {}
  api_key = result.get("apiKey") or {}

  print("Organization ID:", organization.get("id"))
  print("Project ID     :", project_obj.get("id"))
  print("API key        :", api_key.get("key"))

  # Best-effort: update ~/.voike/config.json to use this project/key.
  cfg = load_config()
  cfg.update(
    {
      "baseUrl": cfg["baseUrl"],
      "apiKey": api_key.get("key") or cfg.get("apiKey"),
      "projectId": project_obj.get("id") or cfg.get("projectId"),
    },
  )
  CONFIG_DIR.mkdir(parents=True, exist_ok=True)
  CONFIG_PATH.write_text(
    json.dumps(
      {
        "baseUrl": cfg["baseUrl"],
        "apiKey": cfg["apiKey"],
        "projectId": cfg["projectId"],
      },
      indent=2,
    ),
    encoding="utf-8",
  )
  print("Updated CLI config at ~/.voike/config.json to use this project/key.")


def cmd_run(args: argparse.Namespace) -> None:
  target = args.target
  path = Path(target)

  if path.suffix == ".flow":
    source = _read_flow_source(target)
    result = _execute_flow_from_source(source, "auto")
    print(json.dumps(result, indent=2))
    return

  if path.suffix == ".py":
    abs_path = path if path.is_file() else Path.cwd() / target
    if not abs_path.is_file():
      raise SystemExit(f"Python file not found: {abs_path}")
    completed = subprocess.run([sys.executable, str(abs_path)], check=False)
    if completed.returncode != 0:
      raise SystemExit(completed.returncode)
    return

  raise SystemExit("voike run currently supports .py and .flow files.")


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(prog="voike", description="VOIKE Python CLI")
  subparsers = parser.add_subparsers(dest="command")

  # flow ...
  flow = subparsers.add_parser("flow", help="FLOW orchestration helpers")
  flow_sub = flow.add_subparsers(dest="flow_cmd")

  flow_parse = flow_sub.add_parser("parse", help="Parse a FLOW file")
  flow_parse.add_argument("file", help="Path to .flow file")
  flow_parse.add_argument("--json", action="store_true", help="Print full JSON response")
  flow_parse.set_defaults(func=cmd_flow_parse)

  flow_plan = flow_sub.add_parser("plan", help="Compile FLOW into a plan")
  flow_plan.add_argument("file", help="Path to .flow file")
  flow_plan.set_defaults(func=cmd_flow_plan)

  flow_run = flow_sub.add_parser("run", help="Plan + execute a FLOW file")
  flow_run.add_argument("file", help="Path to .flow file")
  flow_run.add_argument(
    "--mode",
    default="auto",
    help="Execution mode (auto|sync|async)",
  )
  flow_run.set_defaults(func=cmd_flow_run)

  # project create ...
  project = subparsers.add_parser(
    "project",
    help="Manage organizations and projects (admin token required for create)",
  )
  project_sub = project.add_subparsers(dest="project_cmd")
  project_create = project_sub.add_parser(
    "create",
    help='Create a project + API key (e.g. "voike project create ios apple")',
  )
  project_create.add_argument("organization", help="Organization name")
  project_create.add_argument("project", help="Project name")
  project_create.add_argument(
    "key_label",
    nargs="?",
    default="primary",
    help="API key label (default: primary)",
  )

  def project_create_entry(args: argparse.Namespace) -> None:
    cmd_project_create(args.organization, args.project, args.key_label)

  project_create.set_defaults(func=project_create_entry)

  # create project ... (alias)
  create = subparsers.add_parser(
    "create",
    help='Quick helpers (e.g. "voike create project ios apple")',
  )
  create_sub = create.add_subparsers(dest="create_cmd")
  create_project = create_sub.add_parser(
    "project",
    help="Alias for project create",
  )
  create_project.add_argument("organization", help="Organization name")
  create_project.add_argument("project", help="Project name")
  create_project.add_argument(
    "key_label",
    nargs="?",
    default="primary",
    help="API key label (default: primary)",
  )
  create_project.set_defaults(func=project_create_entry)

  # run <target>
  run = subparsers.add_parser(
    "run",
    help="Run a .flow file through VOIKE or a local .py script",
  )
  run.add_argument(
    "target",
    help="Target file (e.g. app.flow or app.py)",
  )
  run.set_defaults(func=cmd_run)

  return parser


def main(argv: Optional[list[str]] = None) -> None:
  parser = build_parser()
  args = parser.parse_args(argv)
  if not getattr(args, "command", None):
    parser.print_help()
    raise SystemExit(1)
  func = getattr(args, "func", None)
  if not func:
    parser.print_help()
    raise SystemExit(1)
  func(args)


if __name__ == "__main__":
  main(sys.argv[1:])
