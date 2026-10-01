const STORAGE_KEY = "constructionPhotoUploadDefaults";
const UPLOAD_BATCH_SIZE = 5;
const form = document.querySelector("#uploadForm");
const photoInput = document.querySelector("#photos");
const previewGrid = document.querySelector("#previewGrid");
const selectedCount = document.querySelector("#selectedCount");
const message = document.querySelector("#uploadMessage");
const uploadButton = document.querySelector("#uploadButton");
const clearButton = document.querySelector("#clearPhotos");
const floorTypeInputs = [...document.querySelectorAll('input[name="floorType"]')];

const controls = {
  date: document.querySelector("#photoDate"),
  floor: document.querySelector("#floor"),
  area: document.querySelector("#area"),
  trade: document.querySelector("#trade"),
  category: document.querySelector("#category")
};

init();

function init() {
  const { trades, categories } = window.APP_CONFIG.options;
  fillSelect(controls.trade, trades);
  fillSelect(controls.category, categories);

  controls.date.value = todayValue();
  restoreDefaults();
  applyQueryDefaults();
  updatePreview();

  ["floor", "area", "trade", "category"].forEach((key) => {
    const eventName = key === "floor" || key === "area" ? "input" : "change";
    controls[key].addEventListener(eventName, saveDefaults);
  });
  floorTypeInputs.forEach((input) => input.addEventListener("change", saveDefaults));
}

function applyQueryDefaults() {
  const params = new URLSearchParams(location.search);
  const floor = params.get("floor");
  if (floor) {
    const floorType = floor.startsWith("#") ? "#" : "F";
    controls.floor.value = floor.replace(/^#/, "").replace(/F$/i, "");
    setFloorType(floorType);
  }

  ["area", "trade", "category"].forEach((key) => {
    let value = params.get(key);
    if (!value) return;
    if (key === "trade" || key === "category") {
      if (![...controls[key].options].some((option) => option.value === value)) return;
    }
    controls[key].value = value;
  });
}

function restoreDefaults() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  ["floor", "area", "trade", "category"].forEach((key) => {
    const value = saved[key];
    if (value == null) return;
    if (!controls[key]) return;
    if (key === "trade" || key === "category") {
      if (![...controls[key].options].some((option) => option.value === value)) return;
    }
    controls[key].value = value;
  });
  setFloorType(saved.floorType || "F");
}

function saveDefaults() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    floor: controls.floor.value,
    floorType: getFloorType(),
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
  selectedCount.textContent = files.length ? "已選擇 " + files.length + " 張" : "尚未選擇照片";

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
  setMessage("正在準備 " + files.length + " 張照片...", "");

  let uploaded = 0;
  try {
    const meta = {
      date: controls.date.value,
      floor: formatFloor(controls.floor.value, getFloorType()),
      area: controls.area.value.trim(),
      trade: controls.trade.value,
      category: controls.category.value,
      note: document.querySelector("#note").value.trim()
    };

    const batches = chunkFiles(files, UPLOAD_BATCH_SIZE);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setMessage(
        "正在處理第 " + (index + 1) + " / " + batches.length +
        " 批（" + batch.length + " 張）...",
        ""
      );
      const photos = await Promise.all(batch.map(compressPhoto));
      const result = await PhotoApi.uploadPhotos({ meta, photos });
      uploaded += result.records.length;
    }

    setMessage("上傳完成：已建立 " + uploaded + " 筆照片紀錄。", "ok");
    photoInput.value = "";
    updatePreview();
  } catch (error) {
    const progress = uploaded ? "已成功上傳 " + uploaded + " 張；" : "";
    setMessage(progress + error.message, "error");
  } finally {
    uploadButton.disabled = false;
  }
});

function chunkFiles(files, size) {
  const batches = [];
  for (let index = 0; index < files.length; index += size) {
    batches.push(files.slice(index, index + size));
  }
  return batches;
}

function getFloorType() {
  return floorTypeInputs.find((input) => input.checked)?.value || "F";
}

function setFloorType(value) {
  const target = floorTypeInputs.find((input) => input.value === value);
  if (target) target.checked = true;
}

function formatFloor(value, type) {
  return type === "#" ? "#" + value : value + "F";
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { maxDimension, jpegQuality } = window.APP_CONFIG.image;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("壓縮照片失敗：" + file.name));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name.replace(/\.[^.]+$/, ".jpg"),
          mimeType: "image/jpeg",
          dataUrl: reader.result
        });
        reader.onerror = () => reject(new Error("讀取照片失敗：" + file.name));
        reader.readAsDataURL(blob);
      }, "image/jpeg", jpegQuality);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("無法開啟照片：" + file.name));
    };
    image.src = objectUrl;
  });
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = "message " + type;
}
