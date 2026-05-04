import base64
import io
from typing import Any

from PIL import Image

IMAGE_SIZES = {
    "320": 320,
    "640": 640,
    "1024": 1024,
}


def ensure_rgb(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        rgb = Image.new("RGB", image.size, (255, 255, 255))
        rgb.paste(image, mask=image.split()[3])
        return rgb
    if image.mode != "RGB":
        return image.convert("RGB")
    return image.copy()


def resize_to_width(base: Image.Image, width: int) -> Image.Image:
    if width >= base.width:
        return base.copy()
    ratio = width / base.width
    height = max(1, int(base.height * ratio))
    return base.resize((width, height), Image.Resampling.LANCZOS)


def image_to_base64(image: Image.Image, quality: int = 80) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality, optimize=False)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def resize_image_local(file_stream: Any, quality: int = 80) -> dict[str, str]:
    with Image.open(file_stream) as original:
        base = ensure_rgb(original)

    sizes: dict[str, str] = {}
    for size_key, width in IMAGE_SIZES.items():
        resized = resize_to_width(base, width)
        sizes[size_key] = image_to_base64(resized, quality=quality)
    return sizes
