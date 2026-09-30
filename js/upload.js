const STORAGE_KEY = "constructionPhotoUploadDefaults";
const form = document.querySelector("#uploadForm");
const photoInput = document.querySelector("#photos");
const previewGrid = document.querySelector("#previewGrid");
const selectedCount = document.querySelector("#selectedCount");
const message = document.querySelector("#uploadMessage");
const uploadButton = document.querySelector("#uploadButton");
const clearButton = document.querySelector("#clearPhotos");

const controls = {
  date: document.querySelector("#photoDate"),
  floor: document.querySelector("#floor"),
  area: document.querySelector("#area"),
  trade: document.querySelector("#trade"),
  category: document.querySelector("#category")
};

init();

function init() {
  const { floors, areas, trades, categories } = window.APP_CONFIG.options;
  fillSelect(controls.floor, floors);
  fillSelect(controls.area, areas);
  fillSelect(controls.trade, trades);
  fillSelect(controls.category, categories);

  controls.date.value = todayValue();
  restoreDefaults();
  applyQueryDefaults();
  updatePreview();

  ["floor", "area", "trade", "category"].forEach((key) => {
    controls[key].addEventListener("change", saveDefaults);
  });
}

function applyQueryDefaults() {
  const params = new URLSearchParams(location.search);
  ["floor", "area", "trade", "category"].forEach((key) => {
    const value = params.get(key);
    if (value && [...controls[key].options].some((option) => option.value === value)) {
      controls[key].value = value;
    }
  });
}

function restoreDefaults() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  Object.entries(saved).forEach(([key, value]) => {
    if (controls[key] && [...controls[key].options].some((option) => option.value === value)) {
      controls[key].value = value;
    }
  });
}

function saveDefaults() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    floor: controls.floor.value,
    area: controls.area.value,
    trade: controls.trade.value,
    category: controls.category.value
  }));
}

photoInput.addEventListener("change", updatePreview);
clearButton.addEventListener("click", () => {
  photoInput.value = "";
  updatePreview();
});

function updatePreview() {
  previewGrid.innerHTML = "";
  const files = [...photoInput.files];
  selectedCount.textContent = files.length ? `已選擇 ${files.length} 張` : "尚未選擇照片";

  files.forEach((file) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    img.addEventListener("load", () => URL.revokeObjectURL(img.src), { once: true });
    item.append(img);
    previewGrid.append(item);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = [...photoInput.files];
  if (!files.length) {
    setMessage("請先選擇照片。", "error");
    return;
  }

  saveDefaults();
  uploadButton.disabled = true;
  setMessage("照片上傳中，請稍候...", "");

  try {
    const photos = await Promise.all(files.map(fileToPayload));
    const payload = {
      meta: {
        date: controls.date.value,
        floor: controls.floor.value,
        area: controls.area.value,
        trade: controls.trade.value,
        category: controls.category.value,
        note: document.querySelector("#note").value.trim()
      },
      photos
    };
    const result = await PhotoApi.uploadPhotos(payload);
    setMessage(`上傳完成：已建立 ${result.records.length} 筆照片紀錄。`, "ok");
    photoInput.value = "";
    updatePreview();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    uploadButton.disabled = false;
  }
});

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      mimeType: file.type || "image/jpeg",
      dataUrl: reader.result
    });
    reader.onerror = () => reject(new Error(`讀取照片失敗：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}
