import os
import uuid
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

import google.auth
from google.auth.credentials import Signing
from google.auth.transport.requests import Request as GoogleAuthRequest
from flask import Flask, jsonify, request
from flask_cors import CORS

from google.cloud import storage

from backend.shared.image_utils import resize_image_local


app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
)
MODE = os.getenv("MODE", "cloud").strip().lower()
PROJECT_ID = os.getenv("PROJECT_ID", "").strip()
UPLOAD_BUCKET = os.getenv("UPLOAD_BUCKET", "").strip()
RESIZED_BUCKET = os.getenv("RESIZED_BUCKET", "").strip()
SIGNED_URL_EXPIRES_SECONDS = int(os.getenv("SIGNED_URL_EXPIRES_SECONDS", "900"))
TARGET_SIZES = [int(size.strip()) for size in os.getenv("TARGET_SIZES", "320,640,1024").split(",") if size.strip()]
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

app.logger.info("Running in %s mode", MODE.upper())
if GOOGLE_APPLICATION_CREDENTIALS:
    app.logger.info("Using service account key from GOOGLE_APPLICATION_CREDENTIALS")
else:
    app.logger.info("Using Google Cloud Application Default Credentials")


def _require_config() -> None:
    missing: list[str] = []
    if not PROJECT_ID:
        missing.append("PROJECT_ID")
    if not UPLOAD_BUCKET:
        missing.append("UPLOAD_BUCKET")
    if missing:
        message = f"Missing required env var(s): {', '.join(missing)}"
        app.logger.error(message)
        raise ValueError(message)
    if not RESIZED_BUCKET:
        app.logger.warning("RESIZED_BUCKET not set; falling back to UPLOAD_BUCKET")


def _generate_upload_signed_url(blob: storage.Blob, content_type: str) -> str:
    expiration = timedelta(seconds=SIGNED_URL_EXPIRES_SECONDS)
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])

    if isinstance(credentials, Signing):
        return blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method="PUT",
            content_type=content_type,
            credentials=credentials,
        )

    auth_request = GoogleAuthRequest()
    credentials.refresh(auth_request)
    service_account_email = getattr(credentials, "service_account_email", None)

    if not service_account_email:
        raise RuntimeError(
            "Cannot resolve service account email for signed URL generation."
        )

    return blob.generate_signed_url(
        version="v4",
        expiration=expiration,
        method="PUT",
        content_type=content_type,
        service_account_email=service_account_email,
        access_token=credentials.token,
    )


@app.get("/health")
def health():
    return {"status": "ok", "mode": MODE}


@app.post("/api/resize-local")
def resize_local():
    try:
        uploaded = request.files.get("file")
        if uploaded is None:
            return jsonify({"error": "Missing file"}), 400

        sizes = resize_image_local(uploaded.stream)
        return jsonify({"status": "done", "sizes": sizes})
    except Exception as exc:
        app.logger.exception("Local resize failed")
        return jsonify({"error": "Failed to resize image", "detail": str(exc)}), 500


@app.post("/api/signed-url")
def create_signed_url():
    if MODE != "cloud":
        return jsonify({"error": "Signed URL endpoint is disabled in local mode"}), 400

    try:
        _require_config()

        payload = request.get_json(silent=True) or {}
        filename = payload.get("filename", "upload.jpg")
        content_type = payload.get("contentType", "image/jpeg")

        object_name = f"uploads/{uuid.uuid4()}-{filename}"

        client = storage.Client(project=PROJECT_ID)
        bucket = client.bucket(UPLOAD_BUCKET)
        blob = bucket.blob(object_name)

        upload_url = _generate_upload_signed_url(blob, content_type)

        resized_bucket = RESIZED_BUCKET or UPLOAD_BUCKET
        return jsonify(
            {
                "uploadUrl": upload_url,
                "objectName": object_name,
                "uploadBucket": UPLOAD_BUCKET,
                "resizedBucket": resized_bucket,
                "targetSizes": TARGET_SIZES,
            }
        )
    except Exception as exc:
        app.logger.exception("Failed to generate signed URL")
        return jsonify({"error": "Failed to generate signed URL", "detail": str(exc)}), 500


@app.route("/api/signed-url", methods=["OPTIONS"])
def handle_options():
    response = jsonify({"status": "ok"})
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    return response


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
