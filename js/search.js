const form = document.querySelector("#searchForm");
const results = document.querySelector("#results");
const message = document.querySelector("#searchMessage");
const searchButton = form.querySelector('button[type="submit"]');
const fields = {
  floor: document.querySelector("#floor"),
  area: document.querySelector("#area"),
  trade: document.querySelector("#trade"),
  category: document.querySelector("#category")
};

let allRecords = [];
let recordsLoaded = false;

initSearch();

async function initSearch() {
  const { trades, categories } = window.APP_CONFIG.options;
  fillSelect(fields.trade, trades, true);
  fillSelect(fields.category, categories, true);
  await loadAllRecords();
}

async function loadAllRecords() {
  searchButton.disabled = true;
  setMessage("正在載入照片資料...", "");

  try {
    const data = await PhotoApi.searchPhotos({});
    allRecords = data.records || [];
    recordsLoaded = true;
    renderResults(allRecords, false);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    searchButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!recordsLoaded) {
    setMessage("照片資料尚未載入完成。", "");
    return;
  }

  const filters = Object.fromEntries(new FormData(form).entries());
  if (filters.floor) {
    filters.floor = filters.floorType === "#" ? "#" + filters.floor : filters.floor + "F";
  }
  const matchedRecords = allRecords.filter((record) => matchesFilters(record, filters));
  renderResults(matchedRecords, true);
});

function matchesFilters(record, filters) {
  const date = String(record.date || "");
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  if (!floorMatches(record.floor, filters.floor)) return false;
  if (!fuzzyMatches(record.area, filters.area)) return false;
  if (!fuzzyMatches(record.trade, filters.trade)) return false;
  if (!fuzzyMatches(record.category, filters.category)) return false;

  const keyword = normalizeText(filters.keyword);
  if (keyword) {
    const haystack = normalizeText([
      record.date,
      record.floor,
      record.area,
      record.trade,
      record.category,
      record.note,
      record.fileName
    ].join(" "));
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

function fuzzyMatches(value, filter) {
  const needle = normalizeText(filter);
  return !needle || normalizeText(value).includes(needle);
}

function floorMatches(value, filter) {
  const needle = normalizeText(filter).replace(/f$/, "");
  const floor = normalizeText(value).replace(/f$/, "");
  return !needle || floor === needle;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function renderResults(records, isFiltered) {
  results.replaceChildren();
  if (!records.length) {
    setMessage(
      isFiltered ? "沒有符合條件的照片，可減少條件後再搜尋。" : "目前沒有照片紀錄。",
      ""
    );
    return;
  }

  setMessage(
    isFiltered
      ? "找到 " + records.length + " 張照片。"
      : "已載入 " + records.length + " 筆照片紀錄。",
    "ok"
  );

  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "results-table";
  table.append(createHeader());

  const body = document.createElement("tbody");
  records.forEach((record, index) => {
    const row = document.createElement("tr");
    appendCell(row, index + 1);
    appendCell(row, record.date);
    appendCell(row, record.floor);
    appendCell(row, record.area);
    appendCell(row, record.trade);
    appendCell(row, record.category);
    appendCell(row, record.note);
    appendCell(row, record.fileName);

    appendLinkCell(row, record.driveUrl, "開啟照片");
    appendLinkCell(row, record.folderUrl, "開啟資料夾");
    body.append(row);
  });

  table.append(body);
  wrapper.append(table);
  results.append(wrapper);
}

function createHeader() {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  ["序號", "日期", "樓層", "區域", "工項", "分類", "備註", "檔名", "照片連結", "日期資料夾"].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    row.append(cell);
  });
  head.append(row);
  return head;
}

function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value == null ? "" : String(value);
  row.append(cell);
}

function appendLinkCell(row, url, label) {
  const cell = document.createElement("td");
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = label;
    cell.append(link);
  } else {
    cell.textContent = "無連結";
  }
  row.append(cell);
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = "message " + type;
}
