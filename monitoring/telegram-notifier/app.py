import json
import os
import urllib.request

import boto3
from flask import Flask, request, jsonify


app = Flask(__name__)

AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
SECRET_ID = os.getenv("SECRET_ID", "devsecops-monitoring/telegram")

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
    status = alert.get("status", "unknown").upper()

    labels = alert.get("labels", {})
    annotations = alert.get("annotations", {})

    alertname = labels.get("alertname", "Unknown")
    severity = labels.get("severity", "unknown")
    summary = annotations.get("summary", "")
    description = annotations.get("description", "")

    emoji = "🚨" if status == "FIRING" else "✅"

    return (
        f"{emoji} <b>Monitoring Alert</b>\n\n"
        f"<b>Status:</b> {status}\n"
        f"<b>Alert:</b> {alertname}\n"
        f"<b>Severity:</b> {severity}\n"
        f"<b>Summary:</b> {summary}\n"
        f"<b>Description:</b> {description}"
    )


@app.route("/webhook", methods=["POST"])
def webhook():
    data = request.get_json(silent=True) or {}

    alerts = data.get("alerts", [])

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


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8080
    )
