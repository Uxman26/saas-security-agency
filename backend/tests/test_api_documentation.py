def test_swagger_and_openapi_are_available_at_public_documentation_path(client):
    swagger = client.get("/swagger/")
    assert swagger.status_code == 200
    assert "/swagger/openapi.json" in swagger.text
    assert '"docExpansion": "none"' in swagger.text
    assert '"persistAuthorization": true' in swagger.text

    schema_response = client.get("/swagger/openapi.json")
    assert schema_response.status_code == 200
    schema = schema_response.json()

    assert schema["servers"][0]["url"] == "/api"
    email_password = schema["components"]["securitySchemes"]["EmailPassword"]
    assert email_password["type"] == "oauth2"
    assert email_password["flows"]["password"]["tokenUrl"] == "/api/auth/swagger-login"
    assert "/auth/swagger-login" not in schema["paths"]
    assert (
        schema["paths"]["/auth/login"]["post"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/TokenResponse"
    )
    assert schema["paths"]["/auth/me"]["get"]["responses"]["401"] == {
        "$ref": "#/components/responses/Unauthorized"
    }


def test_legacy_default_documentation_paths_are_disabled(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_static_staff_report_routes_are_not_shadowed_by_guard_id(client):
    response = client.get(
        "/reports/staff/monthly",
        params={"start_date": "2026-07-01", "end_date": "2026-07-31"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}


def test_swagger_login_accepts_email_in_oauth_username_field(client):
    response = client.post(
        "/auth/swagger-login",
        data={"username": "missing@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "The email or password is incorrect."}
