// Configuration for frontend
window.APP_CONFIG = {
  API_URL: "http://localhost:8080/api/signed-url",
  PUBLIC_BUCKET_URL: "https://storage.googleapis.com/your-resized-bucket-name",
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  POLLING_INTERVAL: 2000, // 2 seconds
  MAX_POLLING_ATTEMPTS: 30 // 60 seconds total
};