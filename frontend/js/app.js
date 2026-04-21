// Load configuration
const CONFIG = window.APP_CONFIG || {
  API_URL: "http://localhost:8080/api/signed-url",
  PUBLIC_BUCKET_URL: "",
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  POLLING_INTERVAL: 2000,
  MAX_POLLING_ATTEMPTS: 30
};

const form = document.getElementById("upload-form");
const fileInput = document.getElementById("image");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");

// Validate file before upload
function validateFile(file) {
  // Check file size
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(`File quá lớn. Kích thước tối đa: ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  // Check file type
  if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Định dạng không được hỗ trợ. Chỉ chấp nhận: ${CONFIG.ALLOWED_TYPES.join(", ")}`);
  }
  
  return true;
}

// Sanitize filename (remove accents, special characters)
function sanitizeFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const ext = filename.split(".").pop();
  
  // Remove accents, replace spaces with dash
  const sanitized = nameWithoutExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  
  return `${sanitized}.${ext}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
}

function updateProgress(percent) {
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (progressBar) {
    progressBar.style.display = percent > 0 && percent < 100 ? "block" : "none";
  }
}

async function uploadWithProgress(url, file, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        updateProgress(percent);
        setStatus(`Đang upload: ${Math.round(percent)}%`);
      }
    });
    
    xhr.addEventListener("load", () => {
      updateProgress(0);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    xhr.addEventListener("error", () => {
      updateProgress(0);
      reject(new Error("Network error during upload"));
    });
    
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

async function uploadImage(file) {
  // Sanitize filename
  const sanitizedName = sanitizeFilename(file.name);
  
  // Step 1: Get signed URL
  setStatus("Đang lấy URL upload...");
  const signedUrlResp = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: sanitizedName,
      contentType: file.type || "image/jpeg",
    }),
  });

  if (!signedUrlResp.ok) {
    const error = await signedUrlResp.text();
    throw new Error(`Không lấy được signed URL: ${error}`);
  }

  const data = await signedUrlResp.json();
  const { uploadUrl, objectName, resizedBucket, targetSizes } = data;

  // Step 2: Upload file with progress
  await uploadWithProgress(uploadUrl, file, file.type || "image/jpeg");
  
  setStatus("Upload thành công! Đang chờ resize ảnh...");
  
  return { objectName, resizedBucket, targetSizes };
}

function displayResizedImages(objectName, bucketName, sizes) {
  const filename = objectName.split("/").pop().replace(/\.[^/.]+$/, "");
  const ext = objectName.split(".").pop();
  const normalizedSizes = Array.isArray(sizes) ? sizes : [];
  const baseUrl = CONFIG.PUBLIC_BUCKET_URL
    ? CONFIG.PUBLIC_BUCKET_URL.replace(/\/$/, "")
    : `https://storage.googleapis.com/${bucketName}`;
  
  let html = "<h3>Ảnh đã được resize:</h3><ul>";
  
  normalizedSizes.forEach(size => {
    const publicUrl = `${baseUrl}/resized/${size}/${filename}.${ext}`;
    html += `
      <li>
        <strong>${size}px:</strong> 
        <a href="${publicUrl}" target="_blank" rel="noopener noreferrer">${publicUrl}</a>
        <br>
        <img src="${publicUrl}" alt="${size}px version" style="max-width: 100%; margin-top: 8px; border-radius: 8px;">
      </li>
    `;
  });
  
  html += "</ul>";
  resultEl.innerHTML = html;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];

  if (!file) {
    setStatus("Hãy chọn 1 ảnh trước khi upload.", true);
    return;
  }

  // Validate file
  try {
    validateFile(file);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  setStatus("Đang chuẩn bị upload...", false);
  resultEl.innerHTML = "";
  updateProgress(0);

  try {
    const { objectName, resizedBucket, targetSizes } = await uploadImage(file);
    
    // Show success message with object info
    setStatus("Upload thành công! Ảnh đang được xử lý...", false);
    
    // Display the resized images immediately with public URLs
    // (They might take a few seconds to appear)
    setTimeout(() => {
      displayResizedImages(objectName, resizedBucket, targetSizes);
      setStatus("Hoàn tất! Xem các phiên bản ảnh bên dưới.", false);
    }, 3000);
    
  } catch (error) {
    console.error("Upload error:", error);
    setStatus(error.message || "Có lỗi xảy ra.", true);
    updateProgress(0);
  }
});