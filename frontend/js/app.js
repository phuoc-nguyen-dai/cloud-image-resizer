// frontend/js/app.js
const CONFIG = window.APP_CONFIG || {
  API_URL: "https://image-resizer-api-176119365962.asia-southeast1.run.app/api/signed-url",
  PUBLIC_BUCKET_URL: "",
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  POLLING_INTERVAL: 2000,
  MAX_POLLING_ATTEMPTS: 30,
};

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

let currentFile = null;
const uploadStats = {
  total: parseInt(localStorage.getItem("totalUploads") || "0", 10),
  totalTime: parseInt(localStorage.getItem("totalTime") || "0", 10),
  successCount: parseInt(localStorage.getItem("successCount") || "0", 10),
  failCount: parseInt(localStorage.getItem("failCount") || "0", 10),
};

const form = document.getElementById("upload-form");
const fileInput = document.getElementById("image");
const dropZone = document.getElementById("drop-zone");
const previewContainer = document.getElementById("preview-container");
const previewImage = document.getElementById("preview-image");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const uploadBtn = document.getElementById("upload-btn");
const progressContainer = document.getElementById("progress-container");
const progressBarLegacy = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");
const progressPercent = document.getElementById("progress-percent");
const statusEl = document.getElementById("status") || document.getElementById("status-container");
const resultsContainer = document.getElementById("results-container") || document.getElementById("result");

if (!form || !fileInput) {
  console.error("Missing required DOM elements for upload flow.");
}

if (uploadBtn) {
  uploadBtn.disabled = false;
}

fileInput?.addEventListener("change", handleFileSelect);

dropZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone?.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    fileInput.files = files;
    handleFileSelect();
  }
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const selectedFile = currentFile || fileInput.files?.[0];

  if (!selectedFile) {
    showToast("Vui lòng chọn ảnh", "error");
    setStatus("Hãy chọn 1 ảnh trước khi upload.", true);
    return;
  }

  const startTime = Date.now();

  try {
    currentFile = selectedFile;
    if (uploadBtn) uploadBtn.disabled = true;
    if (resultsContainer) resultsContainer.innerHTML = "";
    updateProgress(0, "Đang lấy URL upload...");

    const sanitizedName = sanitizeFilename(currentFile.name);
    const cleanNameWithoutExt = sanitizedName.replace(/\.[^/.]+$/, "");

    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: sanitizedName,
        contentType: currentFile.type || "image/jpeg",
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Không lấy được signed URL");
    }

    const data = await response.json();
    await uploadWithProgress(data.uploadUrl, currentFile, currentFile.type || "image/jpeg");

    updateProgress(100, "Đang chờ xử lý ảnh...");
    showToast("✅ Upload thành công! Đang xử lý ảnh...", "success");
    setStatus("Upload thành công! Đang chờ resize ảnh...");

    const bucketUrl =
      CONFIG.PUBLIC_BUCKET_URL &&
      !CONFIG.PUBLIC_BUCKET_URL.includes("your-resized-bucket-name")
        ? CONFIG.PUBLIC_BUCKET_URL.replace(/\/$/, "")
        : `https://storage.googleapis.com/${data.resizedBucket || data.uploadBucket}`;

    try {
      const metadata = await pollForResults(cleanNameWithoutExt, bucketUrl, CONFIG.MAX_POLLING_ATTEMPTS);
      displayResults(metadata);
    } catch (_) {
      if (data.objectName && data.targetSizes) {
        displayResizedImages(data.objectName, data.resizedBucket || data.uploadBucket, data.targetSizes);
      } else {
        throw new Error("Timeout waiting for resize");
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    uploadStats.totalTime += duration;
    localStorage.setItem("totalTime", String(uploadStats.totalTime));

    showToast(`Hoàn thành trong ${duration} giây!`, "success");
    setStatus("Hoàn tất! Xem các phiên bản ảnh bên dưới.");

    clearFile();
    updateProgress(0);
  } catch (error) {
    console.error("Upload error:", error);
    const message = error?.message || "Có lỗi xảy ra";
    showToast(message, "error");
    setStatus(message, true);
    uploadStats.failCount += 1;
    localStorage.setItem("failCount", String(uploadStats.failCount));
    if (uploadBtn) uploadBtn.disabled = false;
    updateProgress(0);
  }
});

function handleFileSelect() {
  const file = fileInput?.files?.[0];
  if (!file) return;

  try {
    validateFile(file);
    currentFile = file;

    if (previewImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target?.result || "";
      };
      reader.readAsDataURL(file);
    }

    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatFileSize(file.size);
    if (previewContainer) previewContainer.classList.add("active");
    if (uploadBtn) uploadBtn.disabled = false;

    showToast("✅ File sẵn sàng để upload", "success");
    setStatus("Đã chọn file, sẵn sàng upload.");
  } catch (error) {
    const message = error?.message || "File không hợp lệ";
    showToast(message, "error");
    setStatus(message, true);
    clearFile();
  }
}

function clearFile() {
  currentFile = null;
  if (fileInput) fileInput.value = "";
  if (previewContainer) previewContainer.classList.remove("active");
}

window.clearFileHandler = clearFile;

function validateFile(file) {
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(`File quá lớn. Tối đa ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Định dạng không được hỗ trợ. Chỉ chấp nhận: ${CONFIG.ALLOWED_TYPES.join(", ")}`);
  }

  return true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const ext = filename.split(".").pop();
  const sanitized = nameWithoutExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `${sanitized}.${ext}`;
}

function extractOriginalNameFromObject(objectName) {
  const filename = (objectName || "").split("/").pop() || "";
  return filename.replace(UUID_PREFIX_RE, "");
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
}

function updateProgress(percent, statusText = "") {
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }

  if (progressPercent) {
    progressPercent.textContent = `${Math.round(percent)}%`;
  }

  if (progressStatus && statusText) {
    progressStatus.textContent = statusText;
  }

  if (progressContainer) {
    progressContainer.style.display = percent > 0 && percent < 100 ? "block" : "none";
  }

  if (progressBarLegacy) {
    progressBarLegacy.style.display = percent > 0 && percent < 100 ? "block" : "none";
  }
}

async function uploadWithProgress(url, file, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.round((e.loaded / e.total) * 100);
      updateProgress(percent, `Đang upload: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`);
      setStatus(`Đang upload: ${percent}%`);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Lỗi mạng")));

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

async function pollForResults(cleanFilename, bucketUrl, maxAttempts = 30) {
  const metadataUrl = `${bucketUrl}/resized/metadata/${cleanFilename}.json`;

  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const response = await fetch(metadataUrl);
      if (response.ok) {
        const metadata = await response.json();
        if (metadata.status === "completed") {
          return metadata;
        }
      }
    } catch (_) {
      // Metadata not ready yet.
    }

    updateProgress(99, `Đang xử lý ảnh... (${i + 1}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, CONFIG.POLLING_INTERVAL));
  }

  throw new Error("Timeout waiting for resize");
}

function displayResults(metadata) {
  const sizes = metadata.sizes || {};
  if (!Object.keys(sizes).length) {
    setStatus("Ảnh đã upload nhưng chưa có file resized. Vui lòng đợi thêm vài giây rồi thử lại.", true);
    return;
  }

  const sizeLabels = {
    320: "Small",
    640: "Medium",
    1024: "Large",
  };

  let html = `
    <div style="margin-top: 32px;">
      <h2>✨ Ảnh đã được resize thành công!</h2>
      <div class="gallery-grid">
  `;

  Object.entries(sizes).forEach(([width, url]) => {
    html += `
      <div class="image-card">
        <div class="image-header">
          <span>${sizeLabels[width] || `${width}px`}</span>
          <span style="font-size: 12px; opacity: 0.9;">${width}px</span>
        </div>
        <div class="image-preview">
          <img src="${url}" alt="${width}px" onclick="openLightbox('${url}')" />
        </div>
        <div class="image-actions">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="flex: 1;">⬇️ Mở ảnh</a>
          <button class="btn btn-secondary" onclick="copyToClipboard('${url}')">📋 Copy</button>
        </div>
      </div>
    `;
  });

  html += "</div></div>";
  if (resultsContainer) resultsContainer.innerHTML = html;

  uploadStats.total += 1;
  uploadStats.successCount += 1;
  localStorage.setItem("totalUploads", String(uploadStats.total));
  localStorage.setItem("successCount", String(uploadStats.successCount));
  updateStats();
}

function displayResizedImages(objectName, bucketName, sizes) {
  const originalFilename = extractOriginalNameFromObject(objectName);
  const filenameWithoutExt = originalFilename.replace(/\.[^/.]+$/, "");
  const normalizedSizes = Array.isArray(sizes) ? sizes : [];

  if (!normalizedSizes.length) {
    setStatus("Ảnh đã upload nhưng chưa nhận được danh sách kích thước resize.", true);
    return;
  }

  const baseUrl = CONFIG.PUBLIC_BUCKET_URL
    ? CONFIG.PUBLIC_BUCKET_URL.replace(/\/$/, "")
    : `https://storage.googleapis.com/${bucketName}`;

  let html = `
    <div style="margin-top: 32px;">
      <h2>✨ Ảnh đã được upload thành công!</h2>
      <p style="margin-bottom: 16px; opacity: 0.9;">Bản resized có thể cần thêm vài giây để sẵn sàng. Nếu link chưa mở được, thử lại sau 5-10 giây.</p>
      <div class="gallery-grid">
  `;

  normalizedSizes.forEach((size) => {
    const publicUrl = `${baseUrl}/resized/${size}/${filenameWithoutExt}.jpg`;
    html += `
      <div class="image-card">
        <div class="image-header">
          <span>${size}px</span>
          <span style="font-size: 12px; opacity: 0.9;">fallback</span>
        </div>
        <div class="image-preview">
          <img src="${publicUrl}" alt="${size}px version" onclick="openLightbox('${publicUrl}')" />
        </div>
        <div class="image-actions">
          <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="flex: 1;">⬇️ Mở ảnh</a>
          <button class="btn btn-secondary" onclick="copyToClipboard('${publicUrl}')">📋 Copy</button>
        </div>
      </div>
    `;
  });

  html += "</div></div>";
  if (resultsContainer) resultsContainer.innerHTML = html;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("📋 Đã copy URL vào clipboard!", "success");
  } catch (_) {
    showToast("Không thể copy URL", "error");
  }
}

window.copyToClipboard = copyToClipboard;

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toast-icon");
  const msg = document.getElementById("toast-message");

  if (!toast || !icon || !msg) return;

  icon.textContent = type === "success" ? "✅" : "❌";
  msg.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function updateStats() {
  const totalUploadsEl = document.getElementById("total-uploads");
  const avgSizeEl = document.getElementById("avg-size");
  const successRateEl = document.getElementById("success-rate");

  if (!totalUploadsEl || !avgSizeEl || !successRateEl) return;

  totalUploadsEl.textContent = String(uploadStats.total);

  const avgTime = uploadStats.total > 0
    ? Math.round(uploadStats.totalTime / uploadStats.total)
    : 0;
  avgSizeEl.textContent = `${avgTime}s`;

  const successRate = uploadStats.total > 0
    ? Math.round((uploadStats.successCount / uploadStats.total) * 100)
    : 100;
  successRateEl.textContent = `${successRate}%`;
}

updateStats();
