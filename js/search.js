const form = document.querySelector("#searchForm");
const results = document.querySelector("#results");
const message = document.querySelector("#searchMessage");
const fields = {
  floor: document.querySelector("#floor"),
  area: document.querySelector("#area"),
  trade: document.querySelector("#trade"),
  category: document.querySelector("#category")
};

initSearch();

function initSearch() {
  const { floors, areas, trades, categories } = window.APP_CONFIG.options;
  fillSelect(fields.floor, floors, true);
  fillSelect(fields.area, areas, true);
  fillSelect(fields.trade, trades, true);
  fillSelect(fields.category, categories, true);
  document.querySelector("#dateTo").value = todayValue();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  results.innerHTML = "";
  setMessage("搜尋中...", "");

  try {
    const filters = Object.fromEntries(new FormData(form).entries());
    const data = await PhotoApi.searchPhotos(filters);
    renderResults(data.records || []);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

function renderResults(records) {
  if (!records.length) {
    setMessage("沒有符合條件的照片。", "");
    return;
  }

  setMessage(`找到 ${records.length} 張照片。`, "ok");
  records.forEach((record) => {
    const item = document.createElement("article");
    item.className = "result-item";

    const imageUrl = record.thumbnailUrl || record.driveUrl;
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = record.fileName || "照片";
      item.append(img);
    }

    const body = document.createElement("div");
    body.className = "result-body";
    body.innerHTML = `
      <strong>${escapeHtml(record.date || "")} ${escapeHtml(record.floor || "")}</strong>
      <span>${escapeHtml(record.area || "")} / ${escapeHtml(record.trade || "")}</span>
      <span>${escapeHtml(record.category || "")}</span>
      <span>${escapeHtml(record.note || "")}</span>
      ${record.driveUrl ? `<a href="${record.driveUrl}" target="_blank" rel="noreferrer">開啟 Drive</a>` : ""}
    `;
    item.append(body);
    results.append(item);
  });
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}
