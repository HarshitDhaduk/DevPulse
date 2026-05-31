FROM python:3.10-slim

WORKDIR /app

# Install curl (for the installation script) and other system dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install Coral CLI using the official script
ENV CORAL_INSTALL_DIR=/usr/local/bin
RUN curl -fsSL https://withcoral.com/install.sh | sh

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Cloud Run defaults to PORT 8080. We map our Uvicorn server to this port.
ENV PORT=8080

# Run Uvicorn when the container starts
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
