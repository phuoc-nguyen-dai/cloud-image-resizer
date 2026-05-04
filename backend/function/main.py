import io
import json
import os
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import request as urllib_request

from google.cloud import storage
from PIL import Image

from backend.shared.image_utils import IMAGE_SIZES, ensure_rgb, resize_to_width

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RESIZED_BUCKET = os.getenv("RESIZED_BUCKET", "")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", "10485760"))  # 10 MB
QUALITY = int(os.getenv("IMAGE_QUALITY", "80"))

storage_client = storage.Client()

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-"
)


def extract_original_filename(object_name: str) -> str:
    """Strip UUID prefix and return the bare filename."""
    filename = object_name.split("/")[-1]
    return UUID_PATTERN.sub("", filename)


def get_image_stem(object_name: str) -> str:
    return Path(extract_original_filename(object_name)).stem


def send_webhook(data: dict[str, Any]) -> None:
    webhook_url = os.getenv("LOCAL_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return
    try:
        payload = json.dumps(data).encode("utf-8")
        req = urllib_request.Request(
            webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib_request.urlopen(req, timeout=5):
            pass
    except Exception as exc:
        logger.error("Webhook failed: %s", exc)


def upload_resized_image(
    destination_bucket: storage.Bucket,
    stem: str,
    size_key: str,
    image: Image.Image,
) -> str:
    target_path = f"resized/{size_key}/{stem}.jpg"
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=QUALITY, optimize=False)
    blob = destination_bucket.blob(target_path)
    blob.upload_from_string(buf.getvalue(), content_type="image/jpeg")
    blob.make_public()
    return blob.public_url


def write_metadata(
    destination_bucket: storage.Bucket,
    stem: str,
    image_id: str,
    status: str,
    sizes: dict[str, str] | None = None,
) -> None:
    metadata: dict[str, Any] = {"id": image_id, "status": status}
    if sizes is not None:
        metadata["sizes"] = sizes
    meta_blob = destination_bucket.blob(f"resized/metadata/{stem}.json")
    meta_blob.upload_from_string(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    meta_blob.make_public()
    logger.info("Metadata written and made public for %s", stem)


def resize_image(event, context):
    _ = context
    start_time = datetime.now()

    source_bucket_name: str = event.get("bucket", "")
    source_object_name: str = event.get("name", "")
    content_type: str = str(event.get("contentType", "") or "")

    try:
        file_size = int(event.get("size", 0) or 0)
    except (TypeError, ValueError):
        file_size = 0

    if not source_object_name.startswith("uploads/"):
        return "Skipped: not in uploads/"

    if file_size > MAX_FILE_SIZE:
        logger.warning("File too large: %s bytes", file_size)
        return "Skipped: file too large"

    if content_type and not content_type.startswith("image/"):
        return "Skipped: not an image"

    image_id = source_object_name.split("/")[-1]
    stem = get_image_stem(source_object_name)
    destination_bucket_name = RESIZED_BUCKET or source_bucket_name
    destination_bucket = storage_client.bucket(destination_bucket_name)

    try:
        source_bucket = storage_client.bucket(source_bucket_name)
        source_blob = source_bucket.blob(source_object_name)
        image_bytes = source_blob.download_as_bytes()

        with Image.open(io.BytesIO(image_bytes)) as original:
            base = ensure_rgb(original)

        resized_urls: dict[str, str] = {}
        for size_key, width in IMAGE_SIZES.items():
            try:
                resized = resize_to_width(base, width)
                url = upload_resized_image(destination_bucket, stem, size_key, resized)
                resized_urls[size_key] = url
                logger.info("Uploaded %spx for %s", width, source_object_name)
            except Exception as exc:
                logger.exception("Failed to process %spx for %s: %s", width, source_object_name, exc)
                write_metadata(destination_bucket, stem, image_id, "failed")
                return "Failed: one or more sizes could not be processed"

        logger.info("Resize complete for %s", source_object_name)

        if len(resized_urls) != len(IMAGE_SIZES):
            logger.error(
                "Incomplete resize result for %s. Expected %d sizes, got %d",
                source_object_name,
                len(IMAGE_SIZES),
                len(resized_urls),
            )
            write_metadata(destination_bucket, stem, image_id, "failed")
            return "Failed: incomplete resize result"

        write_metadata(destination_bucket, stem, image_id, "done", resized_urls)
        send_webhook(
            {
                "id": image_id,
                "status": "done",
                "sizes": resized_urls,
                "timestamp": datetime.now().isoformat(),
            }
        )

        duration = (datetime.now() - start_time).total_seconds()
        logger.info("Done: %d sizes in %.2fs", len(resized_urls), duration)
        return f"Processed {len(resized_urls)} sizes in {duration:.2f}s"
    except Exception as exc:
        logger.exception("Critical failure processing %s: %s", source_object_name, exc)
        try:
            write_metadata(destination_bucket, stem, image_id, "failed")
        except Exception:
            logger.exception("Failed to write failure metadata for %s", source_object_name)
        send_webhook({"id": image_id, "status": "failed", "timestamp": datetime.now().isoformat()})
        return "Failed: critical error"
