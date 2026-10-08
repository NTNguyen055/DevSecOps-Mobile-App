FROM python:3.13-alpine

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup -S notifier \
    && adduser -S notifier -G notifier

COPY app.py .

USER notifier

EXPOSE 8080

CMD ["python", "app.py"]
