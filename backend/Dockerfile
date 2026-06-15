FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
ENV PIP_DEFAULT_TIMEOUT=300
RUN pip install --no-cache-dir --timeout 300 --retries 5 -r requirements.txt
COPY . .
RUN mkdir -p /app/data && chmod +x docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
