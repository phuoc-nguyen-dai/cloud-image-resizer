import { useState, useCallback } from "react";
import { CONFIG, MODE } from "../config";

export type UploadPhase =
  | "idle"
  | "validating"
  | "requesting-url"
  | "uploading"
  | "processing"
  | "done"
  | "error";

export interface UploadState {
  phase: UploadPhase;
  progress: number;
  statusText: string;
  error: string | null;
}

function sanitize(filename: string): string {
  const ext = filename.split(".").pop() ?? "jpg";
  const name = filename
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `${name}.${ext}`;
}

function extractCleanName(objectName: string): string {
  const filename = (objectName ?? "").split("/").pop() ?? "";
  const noUuid = filename.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
  return noUuid.replace(/\.[^/.]+$/, "");
}

function validate(file: File): void {
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(`File quá lớn — tối đa ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  if (!(CONFIG.ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`Định dạng không hỗ trợ. Chấp nhận: JPEG, PNG, WebP, GIF`);
  }
}

async function uploadXHR(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number, loaded: string, total: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      const fmt = (b: number) =>
        b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
      onProgress(pct, fmt(e.loaded), fmt(e.total));
    });
    xhr.addEventListener("load", () => {
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload thất bại (${xhr.status})`));
    });
    xhr.addEventListener("error", () => reject(new Error("Lỗi kết nối mạng")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

export interface ResizedResult {
  sizes: Record<string, string>;
  processedAt: string;
}

async function pollMetadata(
  url: string,
  maxAttempts: number,
  onAttempt: (i: number) => void
): Promise<Record<string, string>> {
  console.log("Polling metadata...");
  for (let i = 0; i < maxAttempts; i++) {
    onAttempt(i);
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { method: "GET", cache: "no-store" });
      if (res.ok) {
        const metadata = await res.json();
        if (metadata?.status === "done" && metadata?.sizes) {
          console.log("Metadata found");
          return metadata.sizes as Record<string, string>;
        }
        if (metadata?.status === "failed") {
          throw new Error("Cloud resize failed");
        }
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, CONFIG.POLLING_INTERVAL));
  }
  throw new Error("Timeout — ảnh chưa được xử lý sau 20 giây");
}

function normalizeLocalSizes(sizes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sizes).map(([size, value]) => [size, value.startsWith("data:") ? value : `data:image/jpeg;base64,${value}`])
  );
}

function localFileUpload(file: File): Promise<ResizedResult> {
  const form = new FormData();
  form.append("file", file);

  return fetch(CONFIG.LOCAL_API_URL, {
    method: "POST",
    body: form,
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error((await res.text()) || "Không resize được ảnh ở local mode");
    }
    const data = await res.json();
    return {
      sizes: normalizeLocalSizes(data.sizes || {}),
      processedAt: new Date().toISOString(),
    };
  });
}

export function useFileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [state, setState] = useState<UploadState>({
    phase: "idle",
    progress: 0,
    statusText: "",
    error: null,
  });
  const [result, setResult] = useState<ResizedResult | null>(null);

  const set = useCallback((patch: Partial<UploadState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const selectFile = useCallback((f: File) => {
    try {
      validate(f);
    } catch (err) {
      set({ phase: "error", error: (err as Error).message });
      return;
    }
    setFile(f);
    setResult(null);
    set({ phase: "idle", error: null, progress: 0, statusText: "" });
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, [set]);

  const clearFile = useCallback(() => {
    setFile(null);
    setPreview("");
    setResult(null);
    setState({ phase: "idle", progress: 0, statusText: "", error: null });
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setResult(null);

    try {
      if (MODE === "local") {
        console.log("Running in LOCAL mode");
        set({ phase: "processing", progress: 35, statusText: "Đang resize ảnh ở local...", error: null });
        const localResult = await localFileUpload(file);
        setResult(localResult);
        set({ phase: "done", progress: 100, statusText: "Hoàn thành!" });
        return;
      }

      console.log("Running in CLOUD mode");
      set({ phase: "requesting-url", progress: 5, statusText: "Đang tạo upload URL...", error: null });

      const sanitizedName = sanitize(file.name);
      const res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: sanitizedName, contentType: file.type || "image/jpeg" }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Không lấy được signed URL");
      const data = await res.json();

      set({ phase: "uploading", progress: 10, statusText: "Uploading to GCS..." });
      console.log("Uploading to GCS...");

      await uploadXHR(data.uploadUrl, file, file.type || "image/jpeg", (pct, loaded, total) => {
        set({
          progress: 10 + Math.round(pct * 0.7),
          statusText: `Upload: ${loaded} / ${total}`,
        });
      });

      set({ phase: "processing", progress: 82, statusText: "Đang resize ảnh trên cloud..." });

      const bucketUrl =
        CONFIG.PUBLIC_BUCKET_URL && !CONFIG.PUBLIC_BUCKET_URL.includes("your-")
          ? CONFIG.PUBLIC_BUCKET_URL.replace(/\/$/, "")
          : `https://storage.googleapis.com/${data.resizedBucket || data.uploadBucket}`;

      const cleanName = extractCleanName(data.objectName);
      const metadataUrl = `${bucketUrl}/resized/metadata/${cleanName}.json`;

      try {
        const cloudSizes = await pollMetadata(metadataUrl, CONFIG.MAX_POLLING_ATTEMPTS, (i) => {
          set({
            progress: 82 + Math.min(i, 15),
            statusText: `Polling metadata... (${i + 1}/${CONFIG.MAX_POLLING_ATTEMPTS})`,
          });
        });
        setResult({ sizes: cloudSizes, processedAt: new Date().toISOString() });
      } catch {
        throw new Error("Timeout — không nhận được kết quả resize");
      }

      console.log("Resize complete");
      set({ phase: "done", progress: 100, statusText: "Hoàn thành!" });
    } catch (err) {
      const msg = (err as Error).message || "Có lỗi xảy ra";
      set({ phase: "error", error: msg, progress: 0, statusText: "" });
    }
  }, [file, set]);

  return { file, preview, state, result, selectFile, clearFile, upload };
}
