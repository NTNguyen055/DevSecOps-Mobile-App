import json
import os
import urllib.request
import hmac
import boto3

from flask import Flask, request, jsonify
from pathlib import Path
from html import escape

app = Flask(__name__)

AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
SECRET_ID = os.getenv("SECRET_ID", "devsecops-monitoring/telegram")
WEBHOOK_TOKEN_FILE = os.getenv(
    "WEBHOOK_TOKEN_FILE",
    "/run/secrets/monitoring_webhook_token"
)

WEBHOOK_TOKEN = Path(
    WEBHOOK_TOKEN_FILE
).read_text(encoding="utf-8").strip()

if not WEBHOOK_TOKEN:
    raise RuntimeError("Webhook authentication token is empty")

secrets_client = boto3.client(
    "secretsmanager",
    region_name=AWS_REGION
)

def get_telegram_secret():
    response = secrets_client.get_secret_value(
        SecretId=SECRET_ID
    )

    secret = json.loads(response["SecretString"])

    return (
        secret["monitor_bot_token"],
        secret["monitor_chat_id"]
    )

def send_telegram(message):
    bot_token, chat_id = get_telegram_secret()

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    payload = json.dumps({
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }).encode("utf-8")

    request_obj = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    with urllib.request.urlopen(request_obj, timeout=10) as response:
        return response.read().decode("utf-8")


def format_alert(alert):
    status = str(alert.get("status", "unknown")).upper()

    labels = alert.get("labels") or {}
    annotations = alert.get("annotations") or {}

    alertname = str(labels.get("alertname", "Unknown"))
    severity = str(labels.get("severity", "unknown"))
    summary = str(annotations.get("summary", ""))
    description = str(annotations.get("description", ""))

    emoji = "🚨" if status == "FIRING" else "✅"

    return (
        f"{emoji} <b>Monitoring Alert</b>\n\n"
        f"<b>Status:</b> {escape(status)}\n"
        f"<b>Alert:</b> {escape(alertname)}\n"
        f"<b>Severity:</b> {escape(severity)}\n"
        f"<b>Summary:</b> {escape(summary)}\n"
        f"<b>Description:</b> {escape(description)}"
    )

@app.route("/webhook", methods=["POST"])
def webhook():
    authorization = request.headers.get("Authorization", "")
    expected = f"Bearer {WEBHOOK_TOKEN}"

    if not hmac.compare_digest(authorization, expected):
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "invalid JSON object"}), 400

    alerts = data.get("alerts", [])

    if not isinstance(alerts, list) or any(
        not isinstance(alert, dict) for alert in alerts
    ):
        return jsonify({"error": "invalid alerts"}), 400

    for alert in alerts:
        if (
            not isinstance(alert.get("labels", {}), dict)
            or not isinstance(alert.get("annotations", {}), dict)
        ):
            return jsonify({"error": "invalid alert fields"}), 400

    if not alerts:
        return jsonify({
            "status": "ignored",
            "reason": "no alerts"
        }), 200

    for alert in alerts:
        message = format_alert(alert)
        send_telegram(message)

    return jsonify({
        "status": "sent",
        "alerts": len(alerts)
    }), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200
