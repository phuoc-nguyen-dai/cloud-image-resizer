# backend/api/webhook_handler.py
from flask import request, jsonify
import requests
from pathlib import Path
import threading

LOCAL_STORAGE_PATH = "./auto_downloaded_images"
Path(LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)


@app.post("/api/webhook/image-ready")
def image_ready_webhook():
    """Nhận thông báo từ Cloud Function và tự động tải ảnh"""
    data = request.get_json()

    # Tải ảnh trong background thread để không block response
    thread = threading.Thread(target=download_images_background, args=(data,))
    thread.start()

    return jsonify({"status": "accepted"}), 202


def download_images_background(data):
    """Tải ảnh trong background"""
    object_name = data.get("objectName", "unknown")
    urls = data.get("urls", {})

    # Tạo folder theo timestamp
    from datetime import datetime
    folder_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{Path(object_name).stem}"
    save_path = Path(LOCAL_STORAGE_PATH) / folder_name
    save_path.mkdir(parents=True, exist_ok=True)

    for size, url in urls.items():
        try:
            response = requests.get(url, timeout=30)
            filename = f"{size}_{url.split('/')[-1]}"
            file_path = save_path / filename
            with open(file_path, 'wb') as f:
                f.write(response.content)
            print(f"✅ Downloaded: {file_path}")
        except Exception as e:
            print(f"❌ Failed to download {url}: {e}")
