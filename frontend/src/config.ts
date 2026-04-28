export const CONFIG = {
  API_URL: "https://image-resizer-api-176119365962.asia-southeast1.run.app/api/signed-url",
  PUBLIC_BUCKET_URL: "" as string,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"] as const,
  POLLING_INTERVAL: 2000,
  MAX_POLLING_ATTEMPTS: 90,
} as const;

export const SIZE_LABELS: Record<number, string> = {
  320: "XS",
  640: "MD",
  1024: "LG",
};
