import functions_framework
import io
import json
import os
import logging
import re
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from google.cloud import storage
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TARGET_SIZES = [320, 640, 1024]
MAX_FILE_SIZE = 10 * 1024 * 1024
QUALITY = 80
MAX_WORKERS = 3

storage_client = storage.Client()

UUID_PATTERN = re.compile(
    r"^[0-9a-f\-]{36}-"
)


def extract_original_filename(object_name: str) -> str:
    filename = object_name.split("/")[-1]
    return UUID_PATTERN.sub("", filename)


def resize_single(image_bytes, width):
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            if img.mode != "RGB":
                img = img.convert("RGB")

            ratio = width / img.width
            height = int(img.height * ratio)

            resized = img.resize((width, height))

            output = io.BytesIO()
            resized.save(output, format="JPEG", quality=QUALITY)

            return width, output.getvalue()
    except Exception as e:
        logger.error(f"Resize lỗi {width}px: {e}")
        return width, None


@functions_framework.cloud_event
def resize_image(cloud_event):
    data = cloud_event.data

    bucket_name = data["bucket"]
    file_name = data["name"]
    content_type = data.get("contentType", "")
    file_size = int(data.get("size", 0))

    print(f"Processing: {file_name}")

    # chỉ xử lý uploads/
    if not file_name.startswith("uploads/"):
        return

    if file_size > MAX_FILE_SIZE:
        return

    if content_type and not content_type.startswith("image/"):
        return

    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)

    image_bytes = blob.download_as_bytes()

    clean_name = extract_original_filename(file_name)
    name = Path(clean_name).stem

    urls = {}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(resize_single, image_bytes, size): size
            for size in TARGET_SIZES
        }

        for future in as_completed(futures):
            size, data_bytes = future.result()
            if not data_bytes:
                continue

            path = f"resized/{size}/{name}.jpg"
            new_blob = bucket.blob(path)
            new_blob.upload_from_string(data_bytes, content_type="image/jpeg")

            urls[str(size)] = new_blob.public_url
            print(f"Uploaded: {path}")

    # tạo metadata
    if urls:
        metadata_blob = bucket.blob(f"resized/metadata/{name}.json")

        metadata = {
            "status": "completed",
            "sizes": urls,
            "processed_at": datetime.now().isoformat()
        }

        metadata_blob.upload_from_string(
            json.dumps(metadata),
            content_type="application/json"
        )

        print("Metadata created")

    return "OK"
