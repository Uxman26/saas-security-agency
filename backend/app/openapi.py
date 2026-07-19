from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


ERROR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["detail"],
    "properties": {
        "detail": {
            "description": "Human-readable message or structured error details.",
            "oneOf": [
                {"type": "string"},
                {"type": "object", "additionalProperties": True},
                {"type": "array", "items": {}},
            ],
        }
    },
}

ERROR_RESPONSES: dict[str, tuple[str, str]] = {
    "400": ("BadRequest", "The request is valid JSON but cannot be processed in its current state."),
    "401": ("Unauthorized", "A valid Bearer access token is required."),
    "402": ("PaymentRequired", "The company subscription is blocked or requires payment."),
    "403": ("Forbidden", "The account or role does not have access to this operation."),
    "404": ("NotFound", "The requested tenant-scoped resource was not found."),
    "409": ("Conflict", "The request conflicts with an existing resource or state."),
    "500": ("InternalServerError", "An unexpected server error occurred."),
    "503": ("ServiceUnavailable", "A required external integration is unavailable or not configured."),
}


def _error_response(description: str, example: Any) -> dict[str, Any]:
    return {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ErrorResponse"},
                "example": {"detail": example},
            }
        },
    }


def configure_openapi(app: FastAPI) -> None:
    """Attach the canonical OpenAPI schema used by Swagger and generated clients."""

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
            servers=app.servers,
        )
        components = schema.setdefault("components", {})
        components.setdefault("schemas", {})["ErrorResponse"] = ERROR_SCHEMA

        response_components = components.setdefault("responses", {})
        response_components.update(
            {
                "BadRequest": _error_response(ERROR_RESPONSES["400"][1], "Invalid request."),
                "Unauthorized": _error_response(ERROR_RESPONSES["401"][1], "Could not validate credentials"),
                "PaymentRequired": _error_response(
                    ERROR_RESPONSES["402"][1],
                    {"code": "payment_pending", "message": "Subscription payment is required."},
                ),
                "Forbidden": _error_response(ERROR_RESPONSES["403"][1], "Insufficient permissions"),
                "NotFound": _error_response(ERROR_RESPONSES["404"][1], "Resource not found"),
                "Conflict": _error_response(ERROR_RESPONSES["409"][1], "Resource already exists"),
                "InternalServerError": _error_response(ERROR_RESPONSES["500"][1], "Internal server error"),
                "ServiceUnavailable": _error_response(
                    ERROR_RESPONSES["503"][1], "External service is unavailable"
                ),
            }
        )

        integration_tags = {"stripe", "email", "sms"}
        for path, path_item in schema.get("paths", {}).items():
            for method, operation in path_item.items():
                if method not in {"get", "post", "put", "patch", "delete"}:
                    continue
                responses = operation.setdefault("responses", {})

                if operation.get("security"):
                    for status_code in ("401", "402", "403"):
                        name = ERROR_RESPONSES[status_code][0]
                        responses.setdefault(status_code, {"$ref": f"#/components/responses/{name}"})

                if "{" in path:
                    responses.setdefault("404", {"$ref": "#/components/responses/NotFound"})

                if method in {"post", "put", "patch"}:
                    responses.setdefault("400", {"$ref": "#/components/responses/BadRequest"})
                    responses.setdefault("409", {"$ref": "#/components/responses/Conflict"})

                responses.setdefault("500", {"$ref": "#/components/responses/InternalServerError"})
                if integration_tags.intersection(operation.get("tags", [])):
                    responses.setdefault("503", {"$ref": "#/components/responses/ServiceUnavailable"})

        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi
