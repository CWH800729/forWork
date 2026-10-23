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
    if (body.action === 'deletePhotos') {
      return jsonOutput(deletePhotos(body.records || [], body.deletePin));
    }
    if (body.action === 'createPhotoArchives') {
      return jsonOutput(createPhotoArchives(body.fileIds || []));
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

  const selectedDate = normalizeSelectedDate(meta.date);
  const normalizedMeta = { ...meta, date: selectedDate };
  const sheet = getRecordSheet();
  const folder = getPhotoFolder(normalizedMeta);
  const uploadTime = Utilities.formatDate(new Date(), SETTINGS.timezone, 'yyyy/MM/dd HH:mm:ss');
  const folderUrl = folder.getUrl();
  const dateKey = selectedDate.replaceAll('-', '');
  const nextSerial = getNextSerial(sheet, normalizedMeta);
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
      selectedDate,
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

function deletePhotos(records, deletePin) {
  const expectedPin = PropertiesService.getScriptProperties().getProperty('DELETE_PIN');
  if (!expectedPin) throw new Error('尚未設定刪除 PIN');
  if (!deletePin || String(deletePin) !== expectedPin) throw new Error('刪除 PIN 錯誤');

  const requestedRecords = (records || []).map((record) => ({
    id: String(record.id || ''),
    fileId: String(record.fileId || '')
  })).filter((record) => record.id && record.fileId);
  const uniqueRecords = [...new Map(
    requestedRecords.map((record) => [record.id + ':' + record.fileId, record])
  ).values()];
  if (!uniqueRecords.length) throw new Error('沒有選取要刪除的照片');
  if (uniqueRecords.length > 100) throw new Error('一次最多刪除 100 張照片');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getRecordSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('找不到照片紀錄');

    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const rowsByKey = new Map(values.map((row, index) => [
      String(row[0]) + ':' + String(row[9]),
      { sheetRow: index + 2, id: String(row[0]), fileId: String(row[9]) }
    ]));
    const targets = uniqueRecords.map((record) => rowsByKey.get(record.id + ':' + record.fileId));
    if (targets.some((target) => !target)) throw new Error('部分照片紀錄不存在，請重新載入後再試');

    const deletedTargets = [];
    const failedNames = [];
    targets.forEach((target) => {
      try {
        DriveApp.getFileById(target.fileId).setTrashed(true);
        deletedTargets.push(target);
      } catch (error) {
        failedNames.push(target.id);
      }
    });

    deletedTargets
      .sort((a, b) => b.sheetRow - a.sheetRow)
      .forEach((target) => sheet.deleteRow(target.sheetRow));

    if (!deletedTargets.length) throw new Error('照片刪除失敗，請確認 Drive 權限');
    return {
      ok: true,
      deletedIds: deletedTargets.map((target) => target.id),
      deletedCount: deletedTargets.length,
      failedCount: failedNames.length
    };
  } finally {
    lock.releaseLock();
  }
}

function createPhotoArchives(fileIds) {
  const uniqueIds = [...new Set((fileIds || []).map(String).filter(Boolean))];
  if (!uniqueIds.length) throw new Error('沒有可打包的照片');
  if (uniqueIds.length > 100) throw new Error('一次最多打包 100 張照片');

  const sheet = getRecordSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('找不到照片紀錄');

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const recordsByFileId = new Map(
    rows.map((row) => [String(row[9]), rowToRecord(row)])
  );
  const records = uniqueIds.map((fileId) => {
    const record = recordsByFileId.get(fileId);
    if (!record) throw new Error('部分照片不在 Sheets 紀錄中');
    return record;
  });

  const rootFolder = getOrCreateRootFolder(SETTINGS.rootFolderName);
  const archiveFolder = getOrCreateChildFolder(rootFolder, '批次下載');
  const dates = records.map((record) => String(record.date || '').replaceAll('-', '')).filter(Boolean).sort();
  const dateLabel = dates.length
    ? dates[0] + (dates[dates.length - 1] !== dates[0] ? '-' + dates[dates.length - 1] : '')
    : Utilities.formatDate(new Date(), SETTINGS.timezone, 'yyyyMMdd');
  const batchSize = 20;
  const archives = [];

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const batchNumber = Math.floor(start / batchSize) + 1;
    const totalBatches = Math.ceil(records.length / batchSize);
    const suffix = totalBatches > 1 ? '_第' + String(batchNumber).padStart(2, '0') + '包' : '';
    const zipName = '施工照片_' + dateLabel + suffix + '.zip';
    const blobs = batch.map((record) => (
      DriveApp.getFileById(record.fileId).getBlob().setName(record.fileName)
    ));
    const zipFile = archiveFolder.createFile(Utilities.zip(blobs, zipName));
    archives.push({
      fileName: zipName,
      count: batch.length,
      driveUrl: zipFile.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + zipFile.getId()
    });
  }

  return { ok: true, archives, totalPhotos: records.length };
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
  const selectedDate = normalizeSelectedDate(meta.date);
  const dateParts = selectedDate.split('-');
  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts.join('');
  return ensureFolderPath([
    SETTINGS.rootFolderName,
    year,
    month,
    day
  ]);
}

function normalizeSelectedDate(value) {
  const selectedDate = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    throw new Error('請選擇有效的照片日期');
  }
  return selectedDate;
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
