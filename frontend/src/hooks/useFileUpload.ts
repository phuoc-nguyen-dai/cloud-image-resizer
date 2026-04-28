import { useState, useCallback, useRef } from "react";
import { CONFIG } from "../config";

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

export interface ResizedResult {
    sizes: Record<string, string>;
    processedAt: string;
}

const UUID_PREFIX_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

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

function extractCleanStem(objectName: string): string {
    const filename = (objectName ?? "").split("/").pop() ?? "";
    const withoutUuidPrefix = filename.replace(UUID_PREFIX_RE, "");
    return withoutUuidPrefix.replace(/\.[^/.]+$/, "");
}

function validate(file: File): void {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        throw new Error(
            `File quá lớn — tối đa ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`
        );
    }
    if (
        file.type &&
        !(CONFIG.ALLOWED_TYPES as readonly string[]).includes(file.type)
    ) {
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
                b < 1024 * 1024
                    ? `${(b / 1024).toFixed(1)} KB`
                    : `${(b / 1024 / 1024).toFixed(1)} MB`;
            onProgress(pct, fmt(e.loaded), fmt(e.total));
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload thất bại (${xhr.status})`));
            }
        });

        xhr.addEventListener("error", () => reject(new Error("Lỗi kết nối mạng")));

        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(file);
    });
}

async function pollMetadata(
    url: string,
    maxAttempts: number,
    onAttempt: (i: number) => void
): Promise<{ sizes: Record<string, string>; processedAt?: string }> {
    for (let i = 0; i < maxAttempts; i++) {
        onAttempt(i);

        const cacheBusterUrl = `${url}?t=${Date.now()}`;
        const res = await fetch(cacheBusterUrl, { cache: "no-store" });

        if (res.status === 404) {
            await new Promise((r) => setTimeout(r, CONFIG.POLLING_INTERVAL));
            continue;
        }

        if (!res.ok) {
            throw new Error(`Không đọc được metadata (${res.status})`);
        }

        const data = (await res.json()) as {
            sizes?: Record<string, string>;
            processed_at?: string;
            processedAt?: string;
        };

        if (data?.sizes && Object.keys(data.sizes).length > 0) {
            return {
                sizes: data.sizes,
                processedAt: data.processed_at || data.processedAt,
            };
        }

        await new Promise((r) => setTimeout(r, CONFIG.POLLING_INTERVAL));
    }

    const totalSeconds = Math.ceil(
        (maxAttempts * CONFIG.POLLING_INTERVAL) / 1000
    );
    throw new Error(`Timeout — ảnh chưa được xử lý sau ${totalSeconds} giây`);
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
    const abortRef = useRef(false);

    const set = useCallback((patch: Partial<UploadState>) => {
        setState((s) => ({ ...s, ...patch }));
    }, []);

    const selectFile = useCallback(
        (f: File) => {
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
        },
        [set]
    );

    const clearFile = useCallback(() => {
        setFile(null);
        setPreview("");
        setResult(null);
        setState({ phase: "idle", progress: 0, statusText: "", error: null });
    }, []);

    const upload = useCallback(async () => {
        if (!file) return;
        abortRef.current = false;
        setResult(null);

        try {
            set({
                phase: "requesting-url",
                progress: 5,
                statusText: "Đang tạo upload URL...",
                error: null,
            });

            const sanitizedName = sanitize(file.name);
            const res = await fetch(CONFIG.API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: sanitizedName,
                    contentType: file.type || "image/jpeg",
                }),
            });

            if (!res.ok) {
                throw new Error((await res.text()) || "Không lấy được signed URL");
            }

            const data = (await res.json()) as {
                uploadUrl: string;
                objectName: string;
                uploadBucket: string;
                resizedBucket?: string;
            };

            set({ phase: "uploading", progress: 10, statusText: "Đang upload ảnh..." });

            await uploadXHR(data.uploadUrl, file, file.type || "image/jpeg", (pct, loaded, total) => {
                set({
                    progress: 10 + Math.round(pct * 0.7),
                    statusText: `Upload: ${loaded} / ${total}`,
                });
            });

            set({
                phase: "processing",
                progress: 82,
                statusText: "Đang resize ảnh trên cloud...",
            });

            const resizedBucket = data.resizedBucket || data.uploadBucket;
            const cleanStem = extractCleanStem(data.objectName);
            const metadataUrl = `https://storage.googleapis.com/${resizedBucket}/resized/metadata/${cleanStem}.json`;

            const meta = await pollMetadata(metadataUrl, CONFIG.MAX_POLLING_ATTEMPTS, (i) => {
                const pct = 82 + Math.round(((i + 1) / CONFIG.MAX_POLLING_ATTEMPTS) * 17);
                set({
                    progress: Math.min(99, pct),
                    statusText: `Đang xử lý... (${i + 1}/${CONFIG.MAX_POLLING_ATTEMPTS})`,
                });
            });

            setResult({
                sizes: meta.sizes,
                processedAt: meta.processedAt || new Date().toISOString(),
            });
            set({ phase: "done", progress: 100, statusText: "Hoàn thành!" });
        } catch (err) {
            if (!abortRef.current) {
                set({
                    phase: "error",
                    error: (err as Error).message || "Có lỗi xảy ra",
                    progress: 0,
                    statusText: "",
                });
            }
        }
    }, [file, set]);

    return { file, preview, state, result, selectFile, clearFile, upload };
}
