import io
import json
import os
import logging
import re
from datetime import datetime
from pathlib import Path
from urllib import request as urllib_request
from concurrent.futures import ThreadPoolExecutor, as_completed

from google.cloud import storage
from PIL import Image

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

RESIZED_BUCKET = os.getenv("RESIZED_BUCKET", "")
TARGET_SIZES = [int(size.strip()) for size in os.getenv(
    "TARGET_SIZES", "640,1024").split(",") if size.strip()]
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", "10485760"))
QUALITY = int(os.getenv("IMAGE_QUALITY", "80"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "3"))

storage_client = storage.Client()

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-"
)


def extract_original_filename(object_name: str) -> str:
    filename = object_name.split("/")[-1]
    return UUID_PATTERN.sub("", filename)


def resize_single_size(image_bytes: bytes, width: int, quality: int = QUALITY) -> tuple[int, bytes | None]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            if img.mode == "RGBA":
                rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                rgb_img.paste(img, (0, 0), img)
                img = rgb_img
            elif img.mode != "RGB":
                img = img.convert("RGB")

            ratio = width / img.width
            height = int(img.height * ratio)
            resized = img.resize((width, height), Image.Resampling.BILINEAR)

            output = io.BytesIO()
            resized.save(output, format="JPEG",
                         quality=quality, optimize=False)
            return width, output.getvalue()
    except Exception as e:
        logger.error("Lỗi resize %spx: %s", width, str(e))
        return width, None


def upload_blob(blob: storage.Blob, data: bytes) -> None:
    blob.upload_from_string(data, content_type="image/jpeg")


def send_webhook_to_local(data: dict) -> None:
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
    except Exception as e:
        logger.error("Webhook failed: %s", str(e))


def resize_image(event, context):
    start_time = datetime.now()

    source_bucket_name = event.get("bucket")
    source_object_name = event.get("name", "")
    content_type = str(event.get("contentType", "") or "")
    try:
        file_size = int(event.get("size", 0) or 0)
    except (TypeError, ValueError):
        file_size = 0

    if not source_object_name.startswith("uploads/"):
        return "Skipped: not in uploads/"

    if file_size > MAX_FILE_SIZE:
        logger.warning("File quá lớn: %s bytes", file_size)
        return "Skipped: file too large"

    if content_type and not content_type.startswith("image/"):
        return "Skipped: not an image"

    source_bucket = storage_client.bucket(source_bucket_name)
    source_blob = source_bucket.blob(source_object_name)
    image_bytes = source_blob.download_as_bytes()

    clean_filename = extract_original_filename(source_object_name)
    name_without_ext = Path(clean_filename).stem

    destination_bucket_name = RESIZED_BUCKET or source_bucket_name
    destination_bucket = storage_client.bucket(destination_bucket_name)

    resized_urls: dict[str, str] = {}
    processed_sizes: list[int] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_width = {
            executor.submit(resize_single_size, image_bytes, width): width
            for width in TARGET_SIZES
        }

        upload_futures = []
        for future in as_completed(future_to_width):
            width, resized_bytes = future.result()
            if not resized_bytes:
                continue

            target_path = f"resized/{width}/{name_without_ext}.jpg"
            target_blob = destination_bucket.blob(target_path)
            upload_future = executor.submit(
                upload_blob, target_blob, resized_bytes)
            upload_futures.append((width, target_blob, upload_future))

        for width, blob, future in upload_futures:
            try:
                future.result()
                processed_sizes.append(width)
                resized_urls[str(width)] = blob.public_url
            except Exception as e:
                logger.error("Lỗi upload %spx: %s", width, str(e))

    if resized_urls:
        metadata_blob = destination_bucket.blob(
            f"resized/metadata/{name_without_ext}.json")
        metadata = {
            "status": "completed",
            "sizes": resized_urls,
            "processed_at": datetime.now().isoformat(),
        }
        metadata_blob.upload_from_string(
            json.dumps(metadata, ensure_ascii=False),
            content_type="application/json",
        )

    send_webhook_to_local(
        {
            "objectName": source_object_name,
            "urls": resized_urls,
            "sizes": processed_sizes,
            "timestamp": datetime.now().isoformat(),
        }
    )

    duration = (datetime.now() - start_time).total_seconds()
    logger.warning("Hoàn thành %s sizes trong %.2fs",
                   len(resized_urls), duration)
    return f"Processed {len(resized_urls)} sizes in {duration:.2f}s"
