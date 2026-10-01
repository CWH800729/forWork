const SETTINGS = {
  rootFolderName: '工地照片管理',
  sheetName: 'PhotoRecords',
  configSheetName: 'Settings',
  timezone: 'Asia/Taipei'
};

const HEADERS = [
  'ID',
  '日期',
  '樓層',
  '區域',
  '工項',
  '分類',
  '備註',
  '檔名',
  'Drive URL',
  'File ID',
  '上傳時間',
  '資料夾 URL'
];

function doGet() {
  return jsonOutput({ ok: true, message: 'Construction Photo Manager API' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'uploadPhotos') {
      return jsonOutput(uploadPhotos(body.meta, body.photos));
    }
    if (body.action === 'searchPhotos') {
      return jsonOutput(searchPhotos(body.filters || {}));
    }
    if (body.action === 'deletePhoto') {
      return jsonOutput(deletePhoto(body.id, body.fileId, body.deletePin));
    }
    throw new Error('Unknown action');
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message });
  }
}

function uploadPhotos(meta, photos) {
  if (!meta || !photos || !photos.length) {
    throw new Error('Missing photo data');
  }

  const sheet = getRecordSheet();
  const folder = getPhotoFolder(meta);
  const uploadTime = Utilities.formatDate(new Date(), SETTINGS.timezone, 'yyyy/MM/dd HH:mm:ss');
  const folderUrl = folder.getUrl();
  const dateKey = String(meta.date).replaceAll('-', '');
  const nextSerial = getNextSerial(sheet, meta);
  const rows = [];
  const records = [];

  photos.forEach((photo, index) => {
    const serial = String(nextSerial + index).padStart(3, '0');
    const fileName = `${dateKey}_${meta.floor}_${meta.area}_${meta.trade}_${meta.category}_${serial}.jpg`;
    const blob = dataUrlToBlob(photo.dataUrl, photo.mimeType).setName(fileName);
    const file = folder.createFile(blob);
    const id = Utilities.getUuid();
    const driveUrl = file.getUrl();

    const row = [
      id,
      meta.date,
      meta.floor,
      meta.area,
      meta.trade,
      meta.category,
      meta.note || '',
      fileName,
      driveUrl,
      file.getId(),
      uploadTime,
      folderUrl
    ];
    rows.push(row);
    records.push(rowToRecord(row));
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  return { ok: true, records };
}

function searchPhotos(filters) {
  const sheet = getRecordSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, records: [] };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const records = values.map(rowToRecord).filter((record) => matchesFilters(record, filters));
  return { ok: true, records };
}

function deletePhoto(id, fileId, deletePin) {
  const expectedPin = PropertiesService.getScriptProperties().getProperty('DELETE_PIN');
  if (!expectedPin) {
    throw new Error('尚未設定刪除 PIN');
  }
  if (!deletePin || String(deletePin) !== expectedPin) {
    throw new Error('刪除 PIN 錯誤');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getRecordSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('找不到照片紀錄');

    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const recordIndex = values.findIndex((row) => (
      String(row[0]) === String(id) && String(row[9]) === String(fileId)
    ));
    if (recordIndex < 0) throw new Error('找不到照片紀錄');

    DriveApp.getFileById(fileId).setTrashed(true);
    sheet.deleteRow(recordIndex + 2);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

function matchesFilters(record, filters) {
  const keyword = normalizeSearchText(filters.keyword);
  const date = normalizeDate(record.date);
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  if (!floorMatch(record.floor, filters.floor)) return false;
  if (!fuzzyMatch(record.area, filters.area)) return false;
  if (!fuzzyMatch(record.trade, filters.trade)) return false;
  if (!fuzzyMatch(record.category, filters.category)) return false;
  if (keyword) {
    const haystack = normalizeSearchText([
      record.date,
      record.floor,
      record.area,
      record.trade,
      record.category,
      record.note,
      record.fileName
    ].join(' '));
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

function fuzzyMatch(value, filter) {
  const needle = normalizeSearchText(filter);
  return !needle || normalizeSearchText(value).includes(needle);
}

function floorMatch(value, filter) {
  const needle = normalizeSearchText(filter).replace(/f$/, '');
  const floor = normalizeSearchText(value).replace(/f$/, '');
  return !needle || floor === needle;
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, SETTINGS.timezone, 'yyyy-MM-dd');
  }

  const text = String(value || '').trim();
  const compact = text.match(/^(\d{4})[\/-]?(\d{1,2})[\/-]?(\d{1,2})$/);
  if (!compact) return text;
  return compact[1] + '-' + compact[2].padStart(2, '0') + '-' + compact[3].padStart(2, '0');
}

function getRecordSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS.sheetName);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function getPhotoFolder(meta) {
  const date = new Date(`${meta.date}T00:00:00`);
  const year = Utilities.formatDate(date, SETTINGS.timezone, 'yyyy');
  const month = Utilities.formatDate(date, SETTINGS.timezone, 'MM');
  const day = Utilities.formatDate(date, SETTINGS.timezone, 'yyyyMMdd');
  return ensureFolderPath([
    SETTINGS.rootFolderName,
    year,
    month,
    day
  ]);
}

function ensureFolderPath(parts) {
  let folder = getOrCreateRootFolder(parts[0]);
  for (let i = 1; i < parts.length; i += 1) {
    folder = getOrCreateChildFolder(folder, parts[i]);
  }
  return folder;
}

function getOrCreateRootFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getOrCreateChildFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function getNextSerial(sheet, meta) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  const dateKey = String(meta.date).replaceAll('-', '');
  const prefix = `${dateKey}_${meta.floor}_${meta.area}_${meta.trade}_${meta.category}_`;
  const fileNames = sheet.getRange(2, 8, lastRow - 1, 1).getValues().flat();
  const maxSerial = fileNames.reduce((max, name) => {
    if (String(name).startsWith(prefix)) {
      const match = String(name).match(/_(\d{3})\.jpg$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }
    return max;
  }, 0);
  return maxSerial + 1;
}

function dataUrlToBlob(dataUrl, mimeType) {
  const base64 = String(dataUrl).split(',')[1];
  const bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, mimeType || 'image/jpeg');
}

function rowToRecord(row) {
  return {
    id: row[0],
    date: normalizeDate(row[1]),
    floor: row[2],
    area: row[3],
    trade: row[4],
    category: row[5],
    note: row[6],
    fileName: row[7],
    driveUrl: row[8],
    fileId: row[9],
    uploadedAt: row[10],
    folderUrl: row[11] || '',
    thumbnailUrl: row[9] ? `https://drive.google.com/thumbnail?id=${row[9]}&sz=w400` : ''
  };
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
