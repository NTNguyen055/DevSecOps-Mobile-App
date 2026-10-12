import json
import pytest
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

@pytest.mark.parametrize(
    "payload",
    [
        [],
        "invalid",
        {"alerts": "invalid"},
        {"alerts": [None]},
        {"alerts": [{"labels": []}]},
        {"alerts": [{"annotations": []}]},
    ]
)
def test_webhook_rejects_invalid_payload(
    client,
    auth_headers,
    payload
):
    response = client.post(
        "/webhook",
        json=payload,
        headers=auth_headers
    )

    assert response.status_code == 400

def test_webhook_rejects_malformed_json(client, auth_headers):
    response = client.post(
        "/webhook",
        data='{"alerts": [',
        content_type="application/json",
        headers=auth_headers
    )

    assert response.status_code == 400

def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}

def test_webhook_rejects_missing_token(client):
    response = client.post(
        "/webhook",
        json={"alerts": []}
    )

    assert response.status_code == 401
    assert response.get_json() == {
        "error": "unauthorized"
    }

def test_webhook_rejects_invalid_token(client):
    response = client.post(
        "/webhook",
        json={"alerts": []},
        headers={"Authorization": "Bearer invalid-token"}
    )

    assert response.status_code == 401

def test_webhook_accepts_valid_token(client, auth_headers):
    response = client.post(
        "/webhook",
        json={"alerts": []},
        headers=auth_headers
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "ignored"

def test_webhook_sends_alerts(
    client,
    notifier,
    auth_headers,
    monkeypatch
):
    mock_send = MagicMock()
    monkeypatch.setattr(notifier, "send_telegram", mock_send)

    response = client.post(
        "/webhook",
        json={
            "alerts": [
                {
                    "status": "firing",
                    "labels": {"alertname": "ApplicationDown"}
                }
            ]
        },
        headers=auth_headers
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "sent",
        "alerts": 1
    }
    mock_send.assert_called_once()

def test_format_firing_alert(notifier):
    message = notifier.format_alert({
        "status": "firing",
        "labels": {
            "alertname": "ApplicationDown",
            "severity": "critical"
        },
        "annotations": {
            "summary": "Application unavailable"
        }
    })

    assert "🚨" in message
    assert "FIRING" in message
    assert "ApplicationDown" in message
    assert "critical" in message
    assert "Application unavailable" in message

def test_format_resolved_alert(notifier):
    message = notifier.format_alert({
        "status": "resolved",
        "labels": {"alertname": "ApplicationDown"}
    })

    assert "✅" in message
    assert "RESOLVED" in message

def test_get_telegram_secret(notifier):
    notifier.mock_secrets_client.get_secret_value.return_value = {
        "SecretString": json.dumps({
            "monitor_bot_token": "fake-bot-token",
            "monitor_chat_id": "fake-chat-id"
        })
    }

    result = notifier.get_telegram_secret()

    assert result == ("fake-bot-token", "fake-chat-id")

def test_send_telegram(notifier, monkeypatch):
    monkeypatch.setattr(
        notifier,
        "get_telegram_secret",
        lambda: ("fake-bot-token", "fake-chat-id")
    )

    response = MagicMock()
    response.read.return_value = b'{"ok":true}'

    context_manager = MagicMock()
    context_manager.__enter__.return_value = response

    mock_urlopen = MagicMock(return_value=context_manager)

    monkeypatch.setattr(
        notifier.urllib.request,
        "urlopen",
        mock_urlopen
    )

    result = notifier.send_telegram("Test alert")

    assert result == '{"ok":true}'
    mock_urlopen.assert_called_once()

    request_obj = mock_urlopen.call_args.args[0]
    payload = json.loads(request_obj.data.decode("utf-8"))

    assert payload["chat_id"] == "fake-chat-id"
    assert payload["text"] == "Test alert"
    assert payload["parse_mode"] == "HTML"
    assert mock_urlopen.call_args.kwargs["timeout"] == 10

def test_format_alert_escapes_html(notifier):
    message = notifier.format_alert({
        "status": "firing",
        "labels": {
            "alertname": "<script>alert(1)</script>",
            "severity": "critical"
        },
        "annotations": {
            "summary": "CPU < 10% & recovering",
            "description": "<b>untrusted</b>"
        }
    })

    assert "&lt;script&gt;" in message
    assert "&lt;/script&gt;" in message
    assert "CPU &lt; 10% &amp; recovering" in message
    assert "&lt;b&gt;untrusted&lt;/b&gt;" in message

    # Formatting owned by the application remains intact.
    assert "<b>Monitoring Alert</b>" in message


@pytest.mark.parametrize(
    "token_content",
    [
        "",
        "   \n"
    ]
)
def test_notifier_rejects_empty_webhook_secret(
    monkeypatch,
    tmp_path,
    token_content
):
    secret_file = tmp_path / "webhook_token"
    secret_file.write_text(
        token_content,
        encoding="utf-8"
    )

    monkeypatch.setenv(
        "WEBHOOK_TOKEN_FILE",
        str(secret_file)
    )

    app_path = (
        Path(__file__).resolve().parents[1]
        / "app.py"
    )

    spec = importlib.util.spec_from_file_location(
        "telegram_notifier_app",
        app_path
    )
    module = importlib.util.module_from_spec(spec)

    with pytest.raises(
        RuntimeError,
        match="Webhook authentication token is empty"
    ):
        spec.loader.exec_module(module)

def test_notifier_rejects_missing_webhook_secret(
    monkeypatch,
    tmp_path
):
    missing_file = tmp_path / "missing_webhook_token"

    monkeypatch.setenv(
        "WEBHOOK_TOKEN_FILE",
        str(missing_file)
    )

    app_path = (
        Path(__file__).resolve().parents[1]
        / "app.py"
    )

    spec = importlib.util.spec_from_file_location(
        "telegram_notifier_app",
        app_path
    )
    module = importlib.util.module_from_spec(spec)

    with pytest.raises(FileNotFoundError):
        spec.loader.exec_module(module)
