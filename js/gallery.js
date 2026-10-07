const galleryGrid = document.querySelector("#galleryGrid");
const galleryMessage = document.querySelector("#galleryMessage");
const bulkDownloadButton = document.querySelector("#bulkDownloadButton");
const selectAllButton = document.querySelector("#selectAllButton");
const clearSelectionButton = document.querySelector("#clearSelectionButton");
const archiveLinks = document.querySelector("#archiveLinks");
let galleryRecords = [];

loadGallery();
bulkDownloadButton.addEventListener("click", createBulkDownload);
selectAllButton.addEventListener("click", () => setAllSelected(true));
clearSelectionButton.addEventListener("click", () => setAllSelected(false));

function loadGallery() {
  const key = new URLSearchParams(location.search).get("key");
  if (!key || !key.startsWith("photoGalleryResult-")) {
    showError("找不到搜尋結果，請返回照片查詢頁重新搜尋。");
    return;
  }

  try {
    const payload = JSON.parse(localStorage.getItem(key) || "{}");
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (!records.length) {
      showError("搜尋結果已失效，請返回照片查詢頁重新搜尋。");
      return;
    }
    renderGallery(records);
  } catch {
    showError("無法讀取搜尋結果，請返回照片查詢頁重新搜尋。");
  }
}

function renderGallery(records) {
  galleryRecords = records;
  galleryMessage.textContent = "共 " + records.length + " 張照片，點擊縮圖可開啟 Drive 原圖。";
  const fragment = document.createDocumentFragment();
  records.forEach((record) => fragment.append(createPhotoCard(record)));
  galleryGrid.replaceChildren(fragment);
  updateSelectionState();
}

function createPhotoCard(record) {
  const card = document.createElement("article");
  card.className = "gallery-card";

  if (record.fileId) {
    const selectionLabel = document.createElement("label");
    selectionLabel.className = "photo-selection desktop-only";
    const selectionInput = document.createElement("input");
    selectionInput.type = "checkbox";
    selectionInput.className = "photo-selection-input";
    selectionInput.value = record.fileId;
    selectionInput.checked = true;
    selectionInput.addEventListener("change", updateSelectionState);
    const selectionText = document.createElement("span");
    selectionText.textContent = "加入打包";
    selectionLabel.append(selectionInput, selectionText);
    card.append(selectionLabel);
  }

  const imageLink = document.createElement("a");
  imageLink.className = "gallery-image-link";
  imageLink.href = record.driveUrl || "#";
  imageLink.target = "_blank";
  imageLink.rel = "noreferrer";
  imageLink.setAttribute("aria-label", "開啟 " + (record.fileName || "照片"));

  const thumbnailUrl = record.thumbnailUrl || (
    record.fileId
      ? "https://drive.google.com/thumbnail?id=" + encodeURIComponent(record.fileId) + "&sz=w500"
      : ""
  );

  if (thumbnailUrl) {
    const image = document.createElement("img");
    image.src = thumbnailUrl;
    image.alt = record.fileName || "施工照片";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      imageLink.append(createImageFallback());
    }, { once: true });
    imageLink.append(image);
  } else {
    imageLink.append(createImageFallback());
  }

  const details = document.createElement("div");
  details.className = "gallery-details";
  const title = document.createElement("strong");
  title.textContent = [record.date, record.floor].filter(Boolean).join(" ");
  details.append(title);
  appendDetail(details, [record.area, record.trade].filter(Boolean).join(" / "));
  appendDetail(details, record.category);
  appendDetail(details, record.note);
  if (record.fileId) {
    const downloadLink = document.createElement("a");
    downloadLink.className = "single-download-link";
    downloadLink.href = createDownloadUrl(record.fileId);
    downloadLink.target = "_blank";
    downloadLink.rel = "noreferrer";
    downloadLink.textContent = "下載單張";
    details.append(downloadLink);
  }

  card.append(imageLink, details);
  return card;
}

function createImageFallback() {
  const fallback = document.createElement("span");
  fallback.className = "gallery-image-fallback";
  fallback.textContent = "縮圖無法顯示，點此開啟照片";
  return fallback;
}

function appendDetail(container, value) {
  if (!value) return;
  const line = document.createElement("span");
  line.textContent = value;
  container.append(line);
}

function showError(text) {
  galleryMessage.textContent = text;
  galleryMessage.className = "gallery-message error";
}

async function createBulkDownload() {
  if (isMobileLayout()) {
    galleryMessage.textContent = "打包下載僅限電腦版使用，手機請使用單張下載。";
    galleryMessage.className = "gallery-message error";
    return;
  }

  const fileIds = getSelectedFileIds();
  if (!fileIds.length) {
    showError("請先勾選要打包的照片。");
    return;
  }
  if (fileIds.length > 100) {
    showError("一次最多打包 100 張照片，請縮小搜尋範圍。");
    return;
  }

  bulkDownloadButton.disabled = true;
  archiveLinks.replaceChildren();
  galleryMessage.textContent = "正在建立 ZIP，請勿關閉此視窗...";
  galleryMessage.className = "gallery-message";

  try {
    const result = await PhotoApi.createPhotoArchives(fileIds);
    renderArchiveLinks(result.archives || []);
    galleryMessage.textContent = "已完成 " + result.totalPhotos + " 張照片打包，請點擊下方連結下載。";
  } catch (error) {
    showError(error.message);
  } finally {
    updateSelectionState();
  }
}

function getSelectedFileIds() {
  return Array.from(document.querySelectorAll(".photo-selection-input:checked"))
    .map((input) => input.value)
    .filter(Boolean);
}

function setAllSelected(checked) {
  document.querySelectorAll(".photo-selection-input").forEach((input) => {
    input.checked = checked;
  });
  updateSelectionState();
}

function updateSelectionState() {
  const selectedCount = getSelectedFileIds().length;
  bulkDownloadButton.textContent = "打包下載（" + selectedCount + "）";
  bulkDownloadButton.disabled = isMobileLayout() || selectedCount === 0;
}

function renderArchiveLinks(archives) {
  const fragment = document.createDocumentFragment();
  archives.forEach((archive) => {
    const link = document.createElement("a");
    link.className = "archive-download-link";
    link.href = archive.downloadUrl || archive.driveUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "下載 " + archive.fileName + "（" + archive.count + " 張）";
    fragment.append(link);
  });
  archiveLinks.replaceChildren(fragment);
}

function createDownloadUrl(fileId) {
  return "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(fileId);
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 767px)").matches;
}
