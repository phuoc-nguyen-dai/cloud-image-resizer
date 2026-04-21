# Project Structure Notes

## Muc tieu

Dam bao thu muc co trach nhiem ro rang va de onboarding.

## Quy uoc

- Khong dat logic API va resize chung mot service.
- Moi service co `requirements.txt`, `main.py`, `.env.example` rieng.
- Tai lieu kien truc, phan cong va quy trinh git dat trong `docs/` hoac file goc.

## Quy trinh de xuat

1. Frontend goi API lay signed URL.
2. Frontend upload file vao bucket uploads.
3. Cloud Function trigger theo su kien object finalized.
4. Anh resized duoc luu bucket dich va tra ve URL hien thi.
