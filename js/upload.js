const STORAGE_KEY = "constructionPhotoUploadDefaults";
const CUSTOM_TRADES_KEY = "constructionPhotoCustomTrades";
const CUSTOM_AREAS_KEY = "constructionPhotoCustomAreas";
const CUSTOM_CATEGORIES_KEY = "constructionPhotoCustomCategories";
const MAX_CUSTOM_TRADES = 30;
const MAX_CUSTOM_AREAS = 30;
const MAX_CUSTOM_CATEGORIES = 30;
const UPLOAD_BATCH_SIZE = 5;
const form = document.querySelector("#uploadForm");
const photoInput = document.querySelector("#photos");
const previewGrid = document.querySelector("#previewGrid");
const selectedCount = document.querySelector("#selectedCount");
const message = document.querySelector("#uploadMessage");
const uploadButton = document.querySelector("#uploadButton");
const clearButton = document.querySelector("#clearPhotos");
const floorTypeInputs = [...document.querySelectorAll('input[name="floorType"]')];
const floorControl = document.querySelector(".floor-control");
const customFloorButton = document.querySelector("#toggleCustomFloor");
const customTradeButton = document.querySelector("#toggleCustomTrade");
const deleteCustomTradeButton = document.querySelector("#deleteCustomTrade");
const customCategoryButton = document.querySelector("#toggleCustomCategory");
const deleteCustomCategoryButton = document.querySelector("#deleteCustomCategory");
const areaSuggestions = document.querySelector("#personalAreas");

const controls = {
  date: document.querySelector("#photoDate"),
  floor: document.querySelector("#floor"),
  customFloor: document.querySelector("#customFloor"),
  area: document.querySelector("#area"),
  trade: document.querySelector("#trade"),
  customTrade: document.querySelector("#customTrade"),
  category: document.querySelector("#category"),
  customCategory: document.querySelector("#customCategory")
};

init();

function init() {
  const { trades, categories } = window.APP_CONFIG.options;
  fillSelect(controls.trade, trades);
  loadPersonalList(CUSTOM_TRADES_KEY).forEach((trade) => appendTradeOption(trade));
  loadPersonalList(CUSTOM_AREAS_KEY).forEach((area) => appendAreaOption(area));
  fillSelect(controls.category, categories);
  loadPersonalList(CUSTOM_CATEGORIES_KEY).forEach((category) => appendCategoryOption(category));

  controls.date.value = todayValue();
  restoreDefaults();
  applyQueryDefaults();
  updatePreview();
  updateDeleteTradeButton();
  updateDeleteCategoryButton();

  ["floor", "area", "trade", "category"].forEach((key) => {
    const eventName = key === "floor" || key === "area" ? "input" : "change";
    controls[key].addEventListener(eventName, () => {
      saveDefaults();
      if (key === "trade") updateDeleteTradeButton();
      if (key === "category") updateDeleteCategoryButton();
    });
  });
  floorTypeInputs.forEach((input) => input.addEventListener("change", saveDefaults));
  customFloorButton.addEventListener("click", () => {
    setCustomFloorMode(!controls.floor.disabled);
  });
  customTradeButton.addEventListener("click", () => {
    setCustomTradeMode(!controls.trade.disabled);
  });
  deleteCustomTradeButton.addEventListener("click", deleteSelectedCustomTrade);
  customCategoryButton.addEventListener("click", () => {
    setCustomCategoryMode(!controls.category.disabled);
  });
  deleteCustomCategoryButton.addEventListener("click", deleteSelectedCustomCategory);
}

function applyQueryDefaults() {
  const params = new URLSearchParams(location.search);
  const floor = params.get("floor");
  if (floor) {
    if (floor.startsWith("#") || /^\d+F$/i.test(floor)) {
      const floorType = floor.startsWith("#") ? "#" : "F";
      controls.floor.value = floor.replace(/^#/, "").replace(/F$/i, "");
      setFloorType(floorType);
      setCustomFloorMode(false);
    } else {
      controls.customFloor.value = floor;
      setCustomFloorMode(true);
    }
  }

  ["area", "trade", "category"].forEach((key) => {
    let value = params.get(key);
    if (!value) return;
    if (key === "trade" || key === "category") {
      const hasOption = [...controls[key].options].some((option) => option.value === value);
      if (!hasOption && key === "trade") {
        controls.customTrade.value = value;
        setCustomTradeMode(true);
        return;
      }
      if (!hasOption && key === "category") {
        controls.customCategory.value = value;
        setCustomCategoryMode(true);
        return;
      }
      if (!hasOption) return;
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
  if (saved.floorMode === "custom") {
    controls.customFloor.value = saved.customFloor || "";
    setCustomFloorMode(true);
  }
}

function saveDefaults() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    floor: controls.floor.value,
    floorType: getFloorType(),
    floorMode: controls.floor.disabled ? "custom" : "standard",
    customFloor: controls.customFloor.value,
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
    const selectedFloor = getFloorValue();
    const usedCustomTrade = controls.trade.disabled;
    const selectedTrade = getTradeValue();
    const usedCustomCategory = controls.category.disabled;
    const selectedCategory = getCategoryValue();
    const selectedArea = controls.area.value.trim();
    const meta = {
      date: controls.date.value,
      floor: selectedFloor,
      area: selectedArea,
      trade: selectedTrade,
      category: selectedCategory,
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
    rememberPersonalValue(CUSTOM_AREAS_KEY, selectedArea, MAX_CUSTOM_AREAS);
    appendAreaOption(selectedArea);
    if (usedCustomTrade) {
      rememberPersonalValue(CUSTOM_TRADES_KEY, selectedTrade, MAX_CUSTOM_TRADES);
      appendTradeOption(selectedTrade);
      controls.trade.value = selectedTrade;
      controls.customTrade.value = "";
      setCustomTradeMode(false);
      saveDefaults();
    }
    if (usedCustomCategory) {
      rememberPersonalValue(CUSTOM_CATEGORIES_KEY, selectedCategory, MAX_CUSTOM_CATEGORIES);
      appendCategoryOption(selectedCategory);
      controls.category.value = selectedCategory;
      controls.customCategory.value = "";
      setCustomCategoryMode(false);
      saveDefaults();
    }
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

function setCustomFloorMode(enabled) {
  floorControl.hidden = enabled;
  controls.floor.disabled = enabled;
  controls.floor.required = !enabled;
  floorTypeInputs.forEach((input) => {
    input.disabled = enabled;
  });
  controls.customFloor.hidden = !enabled;
  controls.customFloor.disabled = !enabled;
  controls.customFloor.required = enabled;
  customFloorButton.textContent = enabled ? "返回數字" : "自訂";
  customFloorButton.setAttribute("aria-pressed", String(enabled));
  if (enabled) controls.customFloor.focus();
}

function getFloorValue() {
  return controls.floor.disabled
    ? controls.customFloor.value.trim()
    : formatFloor(controls.floor.value, getFloorType());
}

function setCustomTradeMode(enabled) {
  if (enabled) controls.trade.value = "其他";
  controls.trade.disabled = enabled;
  controls.trade.required = !enabled;
  controls.customTrade.hidden = !enabled;
  controls.customTrade.disabled = !enabled;
  controls.customTrade.required = enabled;
  customTradeButton.textContent = enabled ? "返回選單" : "自訂";
  customTradeButton.setAttribute("aria-pressed", String(enabled));
  updateDeleteTradeButton();
  if (enabled) controls.customTrade.focus();
}

function getTradeValue() {
  return controls.trade.disabled
    ? controls.customTrade.value.trim()
    : controls.trade.value;
}

function setCustomCategoryMode(enabled) {
  if (enabled) controls.category.value = "其他";
  controls.category.disabled = enabled;
  controls.category.required = !enabled;
  controls.customCategory.hidden = !enabled;
  controls.customCategory.disabled = !enabled;
  controls.customCategory.required = enabled;
  customCategoryButton.textContent = enabled ? "返回選單" : "自訂";
  customCategoryButton.setAttribute("aria-pressed", String(enabled));
  updateDeleteCategoryButton();
  if (enabled) controls.customCategory.focus();
}

function getCategoryValue() {
  return controls.category.disabled
    ? controls.customCategory.value.trim()
    : controls.category.value;
}

function loadPersonalList(key) {
  try {
    const values = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(values) ? values.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rememberPersonalValue(key, item, limit) {
  const value = String(item || "").trim();
  if (!value) return;
  try {
    const values = loadPersonalList(key).filter((savedValue) => savedValue !== value);
    values.unshift(value);
    localStorage.setItem(key, JSON.stringify(values.slice(0, limit)));
  } catch {
    // Personal history is optional and must not affect a successful upload.
  }
}

function appendTradeOption(trade) {
  const value = String(trade || "").trim();
  if (!value) return;
  const exists = [...controls.trade.options].some((option) => option.value === value);
  if (!exists) controls.trade.append(new Option(value, value));
}

function appendCategoryOption(category) {
  const value = String(category || "").trim();
  if (!value) return;
  const exists = [...controls.category.options].some((option) => option.value === value);
  if (!exists) controls.category.append(new Option(value, value));
}

function deleteSelectedCustomTrade() {
  const value = controls.trade.value;
  if (!isPersonalTrade(value)) return;
  removePersonalValue(CUSTOM_TRADES_KEY, value);
  const option = [...controls.trade.options].find((item) => item.value === value);
  if (option) option.remove();
  controls.trade.value = "其他";
  saveDefaults();
  updateDeleteTradeButton();
}

function isPersonalTrade(value) {
  const isBuiltIn = window.APP_CONFIG.options.trades.includes(value);
  return !isBuiltIn && loadPersonalList(CUSTOM_TRADES_KEY).includes(value);
}

function removePersonalValue(key, value) {
  try {
    const values = loadPersonalList(key).filter((item) => item !== value);
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Personal history is optional.
  }
}

function updateDeleteTradeButton() {
  deleteCustomTradeButton.disabled = controls.trade.disabled || !isPersonalTrade(controls.trade.value);
}

function deleteSelectedCustomCategory() {
  const value = controls.category.value;
  if (!isPersonalCategory(value)) return;
  removePersonalValue(CUSTOM_CATEGORIES_KEY, value);
  const option = [...controls.category.options].find((item) => item.value === value);
  if (option) option.remove();
  controls.category.value = "其他";
  saveDefaults();
  updateDeleteCategoryButton();
}

function isPersonalCategory(value) {
  const isBuiltIn = window.APP_CONFIG.options.categories.includes(value);
  return !isBuiltIn && loadPersonalList(CUSTOM_CATEGORIES_KEY).includes(value);
}

function updateDeleteCategoryButton() {
  deleteCustomCategoryButton.disabled = (
    controls.category.disabled || !isPersonalCategory(controls.category.value)
  );
}

function appendAreaOption(area) {
  const value = String(area || "").trim();
  if (!value) return;
  const exists = [...areaSuggestions.options].some((option) => option.value === value);
  if (!exists) areaSuggestions.append(new Option(value, value));
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
