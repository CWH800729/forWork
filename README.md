# 工地照片管理系統

手機優先的 GitHub Pages + Google Apps Script + Google Drive + Google Sheets MVP。

## 目前完成內容

- 首頁：`index.html`
- 照片上傳頁：`upload.html`
- 照片查詢頁：`search.html`
- 手機版樣式：`css/style.css`
- 前端設定：`js/config.js`
- API 串接：`js/api.js`
- 上傳流程、照片壓縮與 localStorage 記憶：`js/upload.js`
- 查詢流程：`js/search.js`
- Apps Script 後端範本：`apps-script/Code.gs`

## 使用步驟

1. 建立 Google Sheet。
2. 在該 Sheet 裡開啟「擴充功能」→「Apps Script」。
3. 將 `apps-script/Code.gs` 貼上。
4. 部署為 Web App。
5. Web App 存取權限先設為可以由前端呼叫的設定。
6. 複製 Web App URL。
7. 確認 `js/config.js` 的 `apiUrl` 是目前部署的 Web App URL。
8. 將整個專案放到 GitHub repository 並啟用 GitHub Pages。

## 第一個測試目標

手機開啟 GitHub Pages，選擇 `5F`、`A區`、`電銲`，一次選 5 張照片，上傳後確認：

- Google Drive 自動出現 `工地照片管理 / 2026 / 09 / 20260930`
- 照片檔名類似 `20260930_5F_A區_電銲_查驗_001.jpg`
- Sheets 每筆新紀錄包含照片網址與日期資料夾網址
- Google Sheets 的 `PhotoRecords` 工作表出現 5 筆紀錄

## 注意

樓層由使用者輸入 1～25，系統會自動儲存為 `1F`～`25F`；區域採自由輸入。工項與分類選項目前先放在 `js/config.js`，方便第一版測試，後續可改成由 Apps Script 讀取 `Settings` 工作表。

照片上傳前會縮小至最長邊 2048px，並以 80% 品質轉成 JPEG，再逐張送至 Apps Script。可在 `js/config.js` 的 `image.maxDimension` 與 `image.jpegQuality` 調整壓縮程度。
