import ssl

from app.services.platform_smtp_service import (
    _safe_smtp_error,
    open_smtp,
    smtp_connect_hosts,
)


def test_ssl_error_is_tls_not_generic_network():
    exc = ssl.SSLError("WRONG_VERSION_NUMBER")
    exc.reason = "WRONG_VERSION_NUMBER"
    status, code, message = _safe_smtp_error(exc, host="mail.controlops.co.uk", port=465)
    assert status == 400
    assert code == "tls_error"
    assert "Network error" not in message
    assert "465" in message or "SSL" in message


def test_timeout_includes_host_and_port():
    _, code, message = _safe_smtp_error(
        TimeoutError("timed out"),
        host="mail.controlops.co.uk",
        port=465,
    )
    assert code == "connection_timeout"
    assert "mail.controlops.co.uk:465" in message
    assert "Network error while contacting the SMTP server" not in message


def test_connect_hosts_uses_env_docker_alias_first(monkeypatch):
    monkeypatch.setattr(
        "app.services.platform_smtp_service.settings",
        type("S", (), {"mail_server": "host.docker.internal", "frontend_url": "https://controlops.co.uk"})(),
    )
    monkeypatch.setattr("app.services.platform_smtp_service._in_docker", lambda: True)
    monkeypatch.delenv("MAIL_CONNECT_HOST", raising=False)
    hosts = smtp_connect_hosts("mail.controlops.co.uk")
    assert hosts[0] == "host.docker.internal"
    assert "mail.controlops.co.uk" in hosts


def test_connect_hosts_mail_connect_host_wins(monkeypatch):
    monkeypatch.setenv("MAIL_CONNECT_HOST", "172.17.0.1")
    monkeypatch.setattr("app.services.platform_smtp_service._in_docker", lambda: False)
    monkeypatch.setattr(
        "app.services.platform_smtp_service.settings",
        type("S", (), {"mail_server": "smtp.gmail.com", "frontend_url": "https://controlops.co.uk"})(),
    )
    hosts = smtp_connect_hosts("mail.controlops.co.uk")
    assert hosts[0] == "172.17.0.1"
    assert hosts[1] == "mail.controlops.co.uk"


def test_connect_hosts_does_not_rewrite_gmail(monkeypatch):
    monkeypatch.setattr(
        "app.services.platform_smtp_service.settings",
        type("S", (), {"mail_server": "host.docker.internal", "frontend_url": "https://controlops.co.uk"})(),
    )
    monkeypatch.setattr("app.services.platform_smtp_service._in_docker", lambda: True)
    monkeypatch.setenv("MAIL_CONNECT_HOST", "host.docker.internal")
    assert smtp_connect_hosts("smtp.gmail.com") == ["smtp.gmail.com"]


def test_open_smtp_retries_docker_gateway(monkeypatch):
    calls: list[str] = []

    class _Server:
        pass

    def fake_open(tcp_host, sni_host, port, use_tls, timeout):
        calls.append(tcp_host)
        if tcp_host == "mail.controlops.co.uk":
            raise OSError(51, "Network is unreachable")
        assert sni_host == "mail.controlops.co.uk"
        return _Server()

    monkeypatch.setattr(
        "app.services.platform_smtp_service.smtp_connect_hosts",
        lambda host: ["mail.controlops.co.uk", "host.docker.internal"],
    )
    monkeypatch.setattr(
        "app.services.platform_smtp_service._open_smtp_socket",
        fake_open,
    )
    server = open_smtp({"mail_server": "mail.controlops.co.uk", "mail_port": 465, "mail_use_tls": False})
    assert isinstance(server, _Server)
    assert calls == ["mail.controlops.co.uk", "host.docker.internal"]
