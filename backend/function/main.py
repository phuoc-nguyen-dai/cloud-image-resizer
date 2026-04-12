import io
import os

from google.cloud import storage
from PIL import Image


RESIZED_BUCKET = os.getenv("RESIZED_BUCKET", "")
TARGET_SIZES = [int(size.strip()) for size in os.getenv(
    "TARGET_SIZES", "320,640,1024").split(",") if size.strip()]

storage_client = storage.Client()


def _resize_image_bytes(image_bytes: bytes, width: int) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as image:
        ratio = width / float(image.width)
        height = int(float(image.height) * ratio)
        resized = image.resize((width, height), Image.Resampling.LANCZOS)

        output = io.BytesIO()
        format_name = image.format or "JPEG"
        resized.save(output, format=format_name)
        return output.getvalue()


def resize_image(event, context):
    source_bucket_name = event.get("bucket")
    source_object_name = event.get("name", "")

    if not source_object_name.startswith("uploads/"):
        return

    destination_bucket_name = RESIZED_BUCKET or source_bucket_name

    source_bucket = storage_client.bucket(source_bucket_name)
    source_blob = source_bucket.blob(source_object_name)
    image_bytes = source_blob.download_as_bytes()

    filename = source_object_name.split("/", 1)[-1]
    destination_bucket = storage_client.bucket(destination_bucket_name)

    for width in TARGET_SIZES:
        resized_bytes = _resize_image_bytes(image_bytes, width)
        target_path = f"resized/{width}/{filename}"
        destination_blob = destination_bucket.blob(target_path)
        destination_blob.upload_from_string(resized_bytes)
