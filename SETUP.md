# Hướng dẫn cài đặt Cloud Image Resizer

## Yêu cầu hệ thống
- Python 3.13+
- Google Cloud SDK (`gcloud`)
- Tài khoản GCP với billing enabled
- Service Account với quyền Storage Admin và Cloud Functions Admin

## Bước 1: Chuẩn bị GCP

### 1.1 Tạo Project và Service Account
```bash
# Set project
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Enable APIs
gcloud services enable storage.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Tạo Service Account
gcloud iam service-accounts create image-resizer-sa \
    --display-name="Image Resizer Service Account"

# Tải key
gcloud iam service-accounts keys create ./backend/api/key.json \
    --iam-account=image-resizer-sa@$PROJECT_ID.iam.gserviceaccount.com