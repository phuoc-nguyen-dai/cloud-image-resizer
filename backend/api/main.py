import os
import uuid
from datetime import timedelta

import google.auth
from google.auth.credentials import Signing
from google.auth.transport.requests import Request as GoogleAuthRequest
from flask import Flask, jsonify, request
from flask_cors import CORS

from google.cloud import storage


app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True
)
PROJECT_ID = os.getenv("PROJECT_ID", "")
UPLOAD_BUCKET = os.getenv("UPLOAD_BUCKET", "")
RESIZED_BUCKET = os.getenv("RESIZED_BUCKET", "")
SIGNED_URL_EXPIRES_SECONDS = int(
    os.getenv("SIGNED_URL_EXPIRES_SECONDS", "900"))
TARGET_SIZES = [int(size.strip()) for size in os.getenv(
    "TARGET_SIZES", "320,640,1024").split(",") if size.strip()]


def _require_config() -> None:
    if not UPLOAD_BUCKET:
        raise ValueError("Missing required env var: UPLOAD_BUCKET")


def _generate_upload_signed_url(blob: storage.Blob, content_type: str) -> str:
    expiration = timedelta(seconds=SIGNED_URL_EXPIRES_SECONDS)
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )

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
    return {"status": "ok"}


@app.post("/api/signed-url")
def create_signed_url():
    try:
        _require_config()

        payload = request.get_json(silent=True) or {}
        filename = payload.get("filename", "upload.jpg")
        content_type = payload.get("contentType", "image/jpeg")

        object_name = f"uploads/{uuid.uuid4()}-{filename}"

        client = storage.Client(project=PROJECT_ID or None)
        bucket = client.bucket(UPLOAD_BUCKET)
        blob = bucket.blob(object_name)

        upload_url = _generate_upload_signed_url(blob, content_type)

        return jsonify(
            {
                "uploadUrl": upload_url,
                "objectName": object_name,
                "uploadBucket": UPLOAD_BUCKET,
                "resizedBucket": RESIZED_BUCKET or UPLOAD_BUCKET,
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
