#!/usr/bin/env python3
"""Generate the checked-in OpenAPI, Postman, and Markdown API references."""

from __future__ import annotations

import copy
import json
import os
import re
from collections import defaultdict
from http.client import responses as HTTP_STATUS_TEXT
from pathlib import Path
from typing import Any

os.environ["CONTROL_OPS_SKIP_DB_INIT"] = "1"

from app.main import app  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCS_DIR = PROJECT_ROOT / "docs"
OPENAPI_PATH = DOCS_DIR / "openapi.json"
POSTMAN_PATH = DOCS_DIR / "ControlOps.postman_collection.json"
REFERENCE_PATH = DOCS_DIR / "API_REFERENCE.md"
METHODS = ("get", "post", "put", "patch", "delete")


def resolve_ref(document: dict[str, Any], value: Any) -> Any:
    seen: set[str] = set()
    while isinstance(value, dict) and "$ref" in value:
        ref = value["$ref"]
        if ref in seen or not ref.startswith("#/"):
            return value
        seen.add(ref)
        current: Any = document
        for part in ref[2:].split("/"):
            current = current[part.replace("~1", "/").replace("~0", "~")]
        value = current
    return value


def example_for_schema(document: dict[str, Any], schema: Any, name: str = "value") -> Any:
    schema = resolve_ref(document, schema)
    if not isinstance(schema, dict):
        return None
    if "example" in schema:
        return schema["example"]
    if "examples" in schema and schema["examples"]:
        return schema["examples"][0]
    if "default" in schema:
        return schema["default"]
    if schema.get("enum"):
        return schema["enum"][0]
    for union_key in ("oneOf", "anyOf"):
        options = schema.get(union_key)
        if options:
            non_null = [option for option in options if option.get("type") != "null"]
            return example_for_schema(document, (non_null or options)[0], name)
    if schema.get("allOf"):
        merged: dict[str, Any] = {}
        for option in schema["allOf"]:
            value = example_for_schema(document, option, name)
            if isinstance(value, dict):
                merged.update(value)
        return merged

    schema_type = schema.get("type")
    if schema_type == "object" or "properties" in schema:
        return {
            key: example_for_schema(document, child, key)
            for key, child in schema.get("properties", {}).items()
            if not child.get("readOnly")
        }
    if schema_type == "array":
        return [example_for_schema(document, schema.get("items", {}), name)]
    if schema_type == "boolean":
        return False
    if schema_type == "integer":
        return schema.get("minimum", 1)
    if schema_type == "number":
        return schema.get("minimum", 1.0)
    if schema_type == "string":
        string_format = schema.get("format")
        return {
            "date": "2026-07-20",
            "date-time": "2026-07-20T12:00:00Z",
            "email": "user@example.com",
            "uuid": "00000000-0000-4000-8000-000000000001",
            "password": "change-me",
            "binary": "",
        }.get(string_format, f"<{name}>")
    return None


def parameter_value(document: dict[str, Any], parameter: dict[str, Any]) -> str:
    schema = resolve_ref(document, parameter.get("schema", {}))
    value = example_for_schema(document, schema, parameter["name"])
    if value is None:
        return f"<{parameter['name']}>"
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"))
    return str(value).lower() if isinstance(value, bool) else str(value)


def request_body(
    document: dict[str, Any], operation: dict[str, Any]
) -> tuple[dict[str, str] | None, dict[str, Any] | None]:
    body = resolve_ref(document, operation.get("requestBody", {}))
    content = body.get("content", {}) if isinstance(body, dict) else {}
    if "application/json" in content:
        media = content["application/json"]
        example = media.get("example", example_for_schema(document, media.get("schema", {})))
        return (
            {"key": "Content-Type", "value": "application/json"},
            {"mode": "raw", "raw": json.dumps(example, indent=2), "options": {"raw": {"language": "json"}}},
        )

    multipart = content.get("multipart/form-data")
    if multipart:
        schema = resolve_ref(document, multipart.get("schema", {}))
        required = set(schema.get("required", []))
        fields = []
        for key, child in schema.get("properties", {}).items():
            child = resolve_ref(document, child)
            is_file = child.get("format") == "binary" or (
                child.get("type") == "array"
                and resolve_ref(document, child.get("items", {})).get("format") == "binary"
            )
            field: dict[str, Any] = {"key": key, "type": "file" if is_file else "text"}
            if not is_file:
                field["value"] = str(example_for_schema(document, child, key) or "")
            if key not in required:
                field["disabled"] = True
            fields.append(field)
        return None, {"mode": "formdata", "formdata": fields}
    return None, None


def postman_request(
    document: dict[str, Any], path: str, method: str, operation: dict[str, Any]
) -> dict[str, Any]:
    parameters = [
        resolve_ref(document, parameter)
        for parameter in operation.get("parameters", [])
    ]
    query = []
    variables = []
    rendered_path = path
    for parameter in parameters:
        location = parameter.get("in")
        if location == "query":
            item: dict[str, Any] = {
                "key": parameter["name"],
                "value": parameter_value(document, parameter),
            }
            if not parameter.get("required"):
                item["disabled"] = True
            query.append(item)
        elif location == "path":
            rendered_path = rendered_path.replace(
                "{" + parameter["name"] + "}", ":" + parameter["name"]
            )
            variables.append(
                {"key": parameter["name"], "value": parameter_value(document, parameter)}
            )

    raw_url = "{{baseUrl}}" + rendered_path
    enabled_query = [f"{item['key']}={item['value']}" for item in query if not item.get("disabled")]
    if enabled_query:
        raw_url += "?" + "&".join(enabled_query)

    header, body = request_body(document, operation)
    request: dict[str, Any] = {
        "method": method.upper(),
        "header": [header] if header else [],
        "url": {
            "raw": raw_url,
            "host": ["{{baseUrl}}"],
            "path": [part for part in rendered_path.split("/") if part],
            "query": query,
            "variable": variables,
        },
        "description": operation.get("description") or operation.get("summary") or "",
    }
    if not operation.get("security"):
        request["auth"] = {"type": "noauth"}
    if body:
        request["body"] = body
    return request


def saved_responses(
    document: dict[str, Any], operation: dict[str, Any], request: dict[str, Any]
) -> list[dict[str, Any]]:
    examples = []
    for status_code, raw_response in sorted(operation.get("responses", {}).items()):
        response = resolve_ref(document, raw_response)
        content = response.get("content", {}) if isinstance(response, dict) else {}
        media = content.get("application/json", {})
        body = ""
        if media:
            value = media.get("example", example_for_schema(document, media.get("schema", {})))
            body = json.dumps(value, indent=2)
        numeric_code = int(status_code) if str(status_code).isdigit() else 0
        examples.append(
            {
                "name": f"{status_code} {response.get('description', '')}".strip(),
                "originalRequest": copy.deepcopy(request),
                "status": HTTP_STATUS_TEXT.get(numeric_code, response.get("description", "")),
                "code": numeric_code,
                "_postman_previewlanguage": "json" if media else "text",
                "header": (
                    [{"key": "Content-Type", "value": "application/json"}] if media else []
                ),
                "cookie": [],
                "body": body,
            }
        )
    return examples


def generate_postman(document: dict[str, Any]) -> dict[str, Any]:
    folders: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path, path_item in document["paths"].items():
        for method in METHODS:
            if method not in path_item:
                continue
            operation = path_item[method]
            request = postman_request(document, path, method, operation)
            item: dict[str, Any] = {
                "name": operation.get("summary") or operation.get("operationId") or f"{method} {path}",
                "request": request,
                "response": saved_responses(document, operation, request),
            }
            if path == "/auth/login" and method == "post":
                item["event"] = [
                    {
                        "listen": "test",
                        "script": {
                            "type": "text/javascript",
                            "exec": [
                                "if (pm.response.code >= 200 && pm.response.code < 300) {",
                                "  const payload = pm.response.json();",
                                "  if (payload.access_token) pm.collectionVariables.set('token', payload.access_token);",
                                "}",
                            ],
                        },
                    }
                ]
            tag = (operation.get("tags") or ["other"])[0]
            folders[tag].append(item)

    return {
        "info": {
            "_postman_id": "24d7652c-9a17-4b1d-978b-controlopsapi",
            "name": "ControlOps API",
            "description": (
                "Generated from docs/openapi.json. Run Auth > Login first; "
                "its test script stores the Bearer token for protected requests."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]},
        "variable": [
            {"key": "baseUrl", "value": "https://controlops.co.uk/api", "type": "string"},
            {"key": "token", "value": "", "type": "string"},
        ],
        "item": [
            {"name": tag.replace("-", " ").title(), "item": items}
            for tag, items in sorted(folders.items())
        ],
    }


def generate_reference(document: dict[str, Any]) -> str:
    groups: dict[str, list[tuple[str, str, dict[str, Any]]]] = defaultdict(list)
    for path, path_item in document["paths"].items():
        for method in METHODS:
            if method in path_item:
                operation = path_item[method]
                tag = (operation.get("tags") or ["other"])[0]
                groups[tag].append((method.upper(), path, operation))

    lines = [
        "# ControlOps API reference",
        "",
        "This file is generated from `docs/openapi.json`; do not edit it manually.",
        "",
        "- Production base URL: `https://controlops.co.uk/api`",
        "- Interactive documentation: `https://controlops.co.uk/swagger/`",
        "- Authentication: `Authorization: Bearer <access_token>`",
        "- Obtain a token with `POST /auth/login`.",
        "",
        "Every JSON error uses `{\"detail\": ...}`. Validation failures return HTTP 422. "
        "Protected operations can also return 401, 402, or 403.",
        "",
    ]
    operation_count = 0
    for tag, operations in sorted(groups.items()):
        lines.extend([f"## {tag.replace('-', ' ').title()}", ""])
        for method, path, operation in operations:
            operation_count += 1
            auth = "Bearer" if operation.get("security") else "Public"
            statuses = ", ".join(sorted(operation.get("responses", {}).keys()))
            summary = operation.get("summary") or operation.get("operationId") or ""
            lines.extend(
                [
                    f"### `{method} {path}`",
                    "",
                    summary,
                    "",
                    f"- Access: {auth}",
                    f"- Documented responses: {statuses}",
                    "",
                ]
            )
    lines.extend([f"Total operations: **{operation_count}**.", ""])
    return "\n".join(lines)


def main() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    document = app.openapi()
    OPENAPI_PATH.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    POSTMAN_PATH.write_text(
        json.dumps(generate_postman(document), indent=2) + "\n", encoding="utf-8"
    )
    REFERENCE_PATH.write_text(generate_reference(document), encoding="utf-8")
    operation_count = sum(
        1 for path_item in document["paths"].values() for method in METHODS if method in path_item
    )
    print(f"Generated {operation_count} operations in {DOCS_DIR}")


if __name__ == "__main__":
    main()
