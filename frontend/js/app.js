const API_URL = window.API_URL || "http://localhost:8080/api/signed-url";

const form = document.getElementById("upload-form");
const fileInput = document.getElementById("image");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
}

async function uploadImage(file) {
  const signedUrlResp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "image/jpeg",
    }),
  });

  if (!signedUrlResp.ok) {
    throw new Error("Khong lay duoc signed URL.");
  }

  const { uploadUrl, objectName } = await signedUrlResp.json();

  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });

  if (!uploadResp.ok) {
    throw new Error("Upload len cloud that bai.");
  }

  return objectName;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];

  if (!file) {
    setStatus("Hay chon 1 anh truoc khi upload.", true);
    return;
  }

  setStatus("Dang upload...", false);
  resultEl.textContent = "";

  try {
    const objectName = await uploadImage(file);
    setStatus(
      "Upload thanh cong. Cloud Function se resize anh trong vai giay.",
      false,
    );
    resultEl.textContent = `Object da upload: ${objectName}`;
  } catch (error) {
    setStatus(error.message || "Co loi xay ra.", true);
  }
});
