const PhotoApi = {
  async request(action, payload) {
    const apiUrl = window.APP_CONFIG.apiUrl;
    if (!apiUrl) {
      throw new Error("尚未設定 Apps Script Web App URL，請先編輯 js/config.js。");
    }

    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    };
    let response;
    try {
      response = await fetch(apiUrl, requestOptions);
    } catch (firstError) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        response = await fetch(apiUrl, requestOptions);
      } catch {
        throw new Error("無法連線到照片服務，請確認網路後重新整理頁面再試一次。");
      }
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "API 回應失敗");
    }
    return data;
  },

  uploadPhotos(payload) {
    return this.request("uploadPhotos", payload);
  },

  searchPhotos(filters) {
    return this.request("searchPhotos", { filters });
  },

  deletePhoto(id, fileId, deletePin) {
    return this.request("deletePhoto", { id, fileId, deletePin });
  },

  createPhotoArchives(fileIds) {
    return this.request("createPhotoArchives", { fileIds });
  }
};

function fillSelect(select, values, includeAllOption = false) {
  select.innerHTML = "";
  if (includeAllOption) {
    select.append(new Option("全部", ""));
  }
  values.forEach((value) => select.append(new Option(value, value)));
}

function todayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
