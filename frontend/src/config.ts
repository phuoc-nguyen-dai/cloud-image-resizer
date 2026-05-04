export const MODE = "cloud" as const;

export const CONFIG = {
  API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/signed-url",
  LOCAL_API_URL: import.meta.env.VITE_LOCAL_API_URL ?? "http://localhost:5000/api/resize-local",
  PUBLIC_BUCKET_URL: import.meta.env.VITE_PUBLIC_BUCKET_URL ?? "https://storage.googleapis.com/cloud-image-resizer-bucket",
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"] as const,
  POLLING_INTERVAL: 2000,
  MAX_POLLING_ATTEMPTS: 10,
} as const;

export const SIZE_LABELS: Record<number, string> = {
  320: "SM",
  640: "MD",
  1024: "LG",
};
