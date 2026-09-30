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
  '上傳時間'
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
  const dateKey = String(meta.date).replaceAll('-', '');
  const nextSerial = getNextSerial(sheet, meta);
  const rows = [];
  const records = [];

  photos.forEach((photo, index) => {
    const serial = String(nextSerial + index).padStart(3, '0');
    const fileName = `${dateKey}_${meta.floor}_${meta.area}_${meta.trade}_${serial}.jpg`;
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
      uploadTime
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

function matchesFilters(record, filters) {
  const keyword = String(filters.keyword || '').trim().toLowerCase();
  const date = String(record.date || '');
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  if (filters.floor && record.floor !== filters.floor) return false;
  if (filters.area && record.area !== filters.area) return false;
  if (filters.trade && record.trade !== filters.trade) return false;
  if (filters.category && record.category !== filters.category) return false;
  if (keyword) {
    const haystack = [record.note, record.fileName, record.area, record.trade, record.category].join(' ').toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

function getRecordSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS.sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getPhotoFolder(meta) {
  const date = new Date(`${meta.date}T00:00:00`);
  const year = Utilities.formatDate(date, SETTINGS.timezone, 'yyyy');
  const month = Utilities.formatDate(date, SETTINGS.timezone, 'MM');
  const day = Utilities.formatDate(date, SETTINGS.timezone, 'yyyy-MM-dd');
  return ensureFolderPath([
    SETTINGS.rootFolderName,
    year,
    month,
    day,
    meta.area,
    meta.trade
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
  const prefix = `${dateKey}_${meta.floor}_${meta.area}_${meta.trade}_`;
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
    date: row[1],
    floor: row[2],
    area: row[3],
    trade: row[4],
    category: row[5],
    note: row[6],
    fileName: row[7],
    driveUrl: row[8],
    fileId: row[9],
    uploadedAt: row[10],
    thumbnailUrl: row[9] ? `https://drive.google.com/thumbnail?id=${row[9]}&sz=w400` : ''
  };
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
