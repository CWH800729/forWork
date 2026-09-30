# 工地照片管理系統

手機優先的 GitHub Pages + Google Apps Script + Google Drive + Google Sheets MVP。

## 目前完成內容

- 首頁：`index.html`
- 照片上傳頁：`upload.html`
- 照片查詢頁：`search.html`
- 手機版樣式：`css/style.css`
- 前端設定：`js/config.js`
- API 串接：`js/api.js`
- 上傳流程與 localStorage 記憶：`js/upload.js`
- 查詢流程：`js/search.js`
- Apps Script 後端範本：`apps-script/Code.gs`

## 使用步驟

1. 建立 Google Sheet。
2. 在該 Sheet 裡開啟「擴充功能」→「Apps Script」。
3. 將 `apps-script/Code.gs` 貼上。
4. 部署為 Web App。
5. Web App 存取權限先設為可以由前端呼叫的設定。
6. 複製 Web App URL。
7. 編輯 `js/config.js`，把 `apiUrl` 填入 Web App URL。
8. 將整個專案放到 GitHub repository 並啟用 GitHub Pages。

## 第一個測試目標

手機開啟 GitHub Pages，選擇 `5F`、`A區`、`電銲`，一次選 5 張照片，上傳後確認：

- Google Drive 自動出現 `工地照片管理 / 2026 / 09 / 2026-09-30 / A區 / 電銲`
- 照片檔名類似 `20260930_5F_A區_電銲_001.jpg`
- Google Sheets 的 `PhotoRecords` 工作表出現 5 筆紀錄

## 注意

`js/config.js` 的選項目前先放在前端，方便第一版測試。後續可以改成由 Apps Script 讀取 `Settings` 工作表，再讓前端載入設定。
