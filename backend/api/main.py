import os
import uuid
from datetime import timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS

from google.cloud import storage


app = Flask(__name__)
CORS(app)
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/signed-url")
def create_signed_url():
    _require_config()

    payload = request.get_json(silent=True) or {}
    filename = payload.get("filename", "upload.jpg")
    content_type = payload.get("contentType", "image/jpeg")

    object_name = f"uploads/{uuid.uuid4()}-{filename}"

    client = storage.Client(project=PROJECT_ID or None)
    bucket = client.bucket(UPLOAD_BUCKET)
    blob = bucket.blob(object_name)

    upload_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=SIGNED_URL_EXPIRES_SECONDS),
        method="PUT",
        content_type=content_type,
    )

    return jsonify(
        {
            "uploadUrl": upload_url,
            "objectName": object_name,
            "uploadBucket": UPLOAD_BUCKET,
            "resizedBucket": RESIZED_BUCKET or UPLOAD_BUCKET,
            "targetSizes": TARGET_SIZES,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
