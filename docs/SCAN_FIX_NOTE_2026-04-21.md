# Scan & Fix Note - 2026-04-21

## Scope
- Scanned updated and newly added files in backend, frontend, infrastructure, and root config.
- Verified syntax and editor diagnostics after fixes.

## Issues Found
1. Cloud Function `file_size` could be a string from GCS event, causing type comparison issues.
2. Resized output extension could diverge from original upload extension, making frontend URLs inconsistent.
3. Frontend ignored `PUBLIC_BUCKET_URL` config when rendering resized image links.
4. `.gitignore` was ignoring all `*.md`, which can hide project docs from version control unexpectedly.

## Fixes Applied
- `backend/function/main.py`
  - Parsed event size safely to integer.
  - Improved image format handling and save options by format.
  - Preserved output extension path consistency with original object name.
  - Kept content-type fallback logic safe.
- `frontend/js/app.js`
  - Used `APP_CONFIG.PUBLIC_BUCKET_URL` when provided.
  - Added fallback to `https://storage.googleapis.com/<bucket>` when not provided.
  - Hardened size list handling and added secure external link attributes.
- `.gitignore`
  - Removed global markdown ignore rule (`*.md`).

## Validation
- IDE diagnostics: no errors on changed files.
- Python syntax check:
  - `python -m py_compile backend/function/main.py backend/api/main.py` passed.
- JavaScript syntax check:
  - `node --check frontend/js/app.js` passed.

## Notes
- Existing newly added image samples under `image/` were not modified.
- Existing new infra files (`infrastructure/cors.json`, `infrastructure/deploy-function.sh`) were reviewed and left unchanged.
