# Cloud Image Resizer

He thong demo serverless resize anh voi Google Cloud Storage + Cloud Function.

## Cau truc chinh

- `frontend/`: UI upload anh va hien thi ket qua
- `backend/api/`: API tao signed URL
- `backend/function/`: Cloud Function resize anh
- `infrastructure/`: tai lieu/ma ha tang
- `docs/`: tai lieu thiet ke va quy uoc

## Khoi dong nhanh

1. Thiet lap API trong `backend/api/`.
2. Deploy Cloud Function trong `backend/function/`.
3. Cau hinh bien moi truong theo file `.env.example`.
4. Mo `frontend/index.html` de test luong upload.

## Luu y

- Bo sung thong tin bucket, service account va CORS truoc khi demo.
- Nen tach nhanh branch theo tinh nang thay vi push truc tiep vao `main`.
