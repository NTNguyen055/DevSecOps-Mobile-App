
import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest


APP_DIR = Path(__file__).resolve().parents[1]
APP_PATH = APP_DIR / "app.py"


@pytest.fixture
def notifier(monkeypatch, tmp_path):
    """Load the notifier without accessing AWS or real secrets."""

    token_file = tmp_path / "webhook_token"
    token_file.write_text(
        "unit-test-webhook-token",
        encoding="utf-8"
    )

    monkeypatch.setenv("WEBHOOK_TOKEN_FILE", str(token_file))
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")

    mock_secrets_client = MagicMock()

    import boto3

    monkeypatch.setattr(
        boto3,
        "client",
        lambda *args, **kwargs: mock_secrets_client
    )

    spec = importlib.util.spec_from_file_location(
        "telegram_notifier_app",
        APP_PATH
    )

    module = importlib.util.module_from_spec(spec)

    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)

    module.mock_secrets_client = mock_secrets_client
    module.app.config["TESTING"] = True

    return module


@pytest.fixture
def client(notifier):
    return notifier.app.test_client()


@pytest.fixture
def auth_headers():
    return {
        "Authorization": "Bearer unit-test-webhook-token"
    }
