# backend/api/file_manager.py - Tiện ích quản lý
import shutil
from pathlib import Path
from datetime import datetime, timedelta


def cleanup_old_files(days=7):
    """Xóa các file cũ hơn N ngày"""
    cutoff = datetime.now() - timedelta(days=days)
    storage_path = Path("./downloaded_images")

    for folder in storage_path.iterdir():
        if folder.is_dir():
            folder_time = datetime.fromtimestamp(folder.stat().st_ctime)
            if folder_time < cutoff:
                shutil.rmtree(folder)
                print(f"Deleted old folder: {folder}")


def get_storage_stats():
    """Thống kê dung lượng đã lưu"""
    storage_path = Path("./downloaded_images")
    total_size = sum(
        f.stat().st_size for f in storage_path.rglob("*") if f.is_file())
    total_files = sum(1 for f in storage_path.rglob("*") if f.is_file())
    total_folders = sum(1 for f in storage_path.iterdir() if f.is_dir())

    return {
        "totalSize": total_size,
        "totalFiles": total_files,
        "totalFolders": total_folders,
        "sizeHuman": f"{total_size / (1024*1024):.2f} MB"
    }
