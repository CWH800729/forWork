const galleryGrid = document.querySelector("#galleryGrid");
const galleryMessage = document.querySelector("#galleryMessage");

loadGallery();

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
  galleryMessage.textContent = "共 " + records.length + " 張照片，點擊縮圖可開啟 Drive 原圖。";
  const fragment = document.createDocumentFragment();
  records.forEach((record) => fragment.append(createPhotoCard(record)));
  galleryGrid.replaceChildren(fragment);
}

function createPhotoCard(record) {
  const card = document.createElement("article");
  card.className = "gallery-card";

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
