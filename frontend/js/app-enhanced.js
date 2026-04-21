// frontend/js/app-enhanced.js
const CONFIG = window.APP_CONFIG || {
  API_URL: "http://localhost:8080/api/signed-url",
  PUBLIC_BUCKET_URL: "",
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  POLLING_INTERVAL: 2000,
  MAX_POLLING_ATTEMPTS: 30,
};

let currentFile = null;
let uploadStats = {
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
const progressFill = document.getElementById("progress-fill");
const progressStatus = document.getElementById("progress-status");
const progressPercent = document.getElementById("progress-percent");
const resultsContainer = document.getElementById("results-container");

if (!form || !fileInput || !dropZone || !uploadBtn) {
  console.error("Missing required DOM elements for upload flow.");
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

  if (!currentFile) {
    showToast("Vui lòng chọn ảnh", "error");
    return;
  }

  const startTime = Date.now();

  try {
    progressContainer.style.display = "block";
    uploadBtn.disabled = true;
    resultsContainer.innerHTML = "";

    progressStatus.textContent = "Đang lấy URL upload...";
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
      throw new Error("Không lấy được signed URL");
    }

    const data = await response.json();

    await uploadWithProgress(data.uploadUrl, currentFile, currentFile.type || "image/jpeg");

    progressStatus.textContent = "Đang chờ xử lý ảnh...";
    showToast("✅ Upload thành công! Đang xử lý ảnh...", "success");

    const bucketUrl =
      CONFIG.PUBLIC_BUCKET_URL &&
      !CONFIG.PUBLIC_BUCKET_URL.includes("your-resized-bucket-name")
        ? CONFIG.PUBLIC_BUCKET_URL.replace(/\/$/, "")
        : `https://storage.googleapis.com/${data.resizedBucket || data.uploadBucket}`;

    const metadata = await pollForResults(cleanNameWithoutExt, bucketUrl, CONFIG.MAX_POLLING_ATTEMPTS);

    const duration = Math.round((Date.now() - startTime) / 1000);
    uploadStats.totalTime += duration;
    localStorage.setItem("totalTime", String(uploadStats.totalTime));

    showToast(`🎉 Hoàn thành trong ${duration} giây!`, "success");
    displayResults(metadata);

    clearFile();
    progressContainer.style.display = "none";
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";
  } catch (error) {
    console.error("Upload error:", error);
    showToast(error.message || "Có lỗi xảy ra", "error");
    uploadStats.failCount += 1;
    localStorage.setItem("failCount", String(uploadStats.failCount));
    uploadBtn.disabled = false;
    progressContainer.style.display = "none";
  }
});

function handleFileSelect() {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    validateFile(file);
    currentFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target?.result || "";
    };
    reader.readAsDataURL(file);

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    previewContainer.classList.add("active");
    uploadBtn.disabled = false;

    showToast("✅ File sẵn sàng để upload", "success");
  } catch (error) {
    showToast(error.message, "error");
    clearFile();
  }
}

function clearFile() {
  currentFile = null;
  fileInput.value = "";
  previewContainer.classList.remove("active");
  uploadBtn.disabled = true;
}

window.clearFileHandler = clearFile;

function validateFile(file) {
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(`File quá lớn. Tối đa ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Định dạng không hỗ trợ. Chỉ chấp nhận ảnh");
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

async function uploadWithProgress(url, file, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressStatus.textContent = `Đang upload: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`;
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

    progressStatus.textContent = `Đang xử lý ảnh... (${i + 1}/${maxAttempts})`;
    await new Promise((resolve) => setTimeout(resolve, CONFIG.POLLING_INTERVAL));
  }

  throw new Error("Timeout waiting for resize");
}

function displayResults(metadata) {
  const sizes = metadata.sizes || {};
  const sizeLabels = {
    320: "Small",
    640: "Medium",
    1024: "Large",
  };

  let html = `
    <div style="margin-top: 32px;">
      <h2>✨ Ảnh đã được resize thành công!</h2>
      <div class="gallery">
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
          <a href="${url}" download class="btn btn-primary" style="flex: 1;">⬇️ Tải xuống</a>
          <button class="btn btn-secondary" onclick="copyToClipboard('${url}')">📋 Copy</button>
        </div>
      </div>
    `;
  });

  html += "</div></div>";
  resultsContainer.innerHTML = html;

  uploadStats.total += 1;
  uploadStats.successCount += 1;
  localStorage.setItem("totalUploads", String(uploadStats.total));
  localStorage.setItem("successCount", String(uploadStats.successCount));
  updateStats();
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

  if (!toast || !icon || !msg) {
    return;
  }

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

  // Stats section is optional in HTML.
  if (!totalUploadsEl || !avgSizeEl || !successRateEl) {
    return;
  }

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