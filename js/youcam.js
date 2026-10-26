/* Browser client for YouCam Skin Analysis and Apparel try-on.
   The API allows cross-origin calls (Access-Control-Allow-Origin: *).
   Photographs are registered, then PUT to the signed storage URL.
   Content-Length is left to the browser: fetch forbids setting it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YouCam = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MESSAGES = {
    missing_key: "Add your YouCam API key before a reading.",
    InvalidApiKey: "That API key was refused. Check config.js, or paste the key from the registration email.",
    InvalidAccessToken: "That API key was refused.",
    CreditInsufficiency: "The YouCam balance does not cover this task. The console shows what is left of the 1,000 units.",
    InvalidParameters: "The request was refused as invalid. HD and SD scores cannot be mixed, and every score name has to be real.",
    error_no_face: "No face in this photograph. Come closer, face the lens, and keep the forehead in frame.",
    error_src_face_too_small: "The face is too small. It needs to span most of the width of the photograph.",
    error_src_face_out_of_bound: "The face is cut off. Keep the forehead, chin, and both cheeks in frame.",
    error_lighting_dark: "The light is too low for a reliable reading.",
    error_pose: "The pose could not be read. Face the lens, upright, eyes open.",
    error_below_min_image_size: "The photograph is too small for this task.",
    error_exceed_max_image_size: "The photograph is too large. This app resizes the long side to 2560 before upload.",
    exceed_max_filesize: "The file is over the size limit.",
    error_decode_image: "The image could not be decoded. Use a JPEG or PNG.",
    error_nsfw_content_detected: "The service refused the image.",
    error_face_parsing: "The face could not be segmented. Try a clearer, front-facing photograph.",
    error_inference: "The model failed while reading this photograph. A failed task should not spend a unit.",
    unknown_internal_error: "The service failed internally. A failed task should not spend a unit.",
    error_invalid_ref: "The garment image was refused. Use one garment, front-facing, fully in frame.",
    error_invalid_src: "The try-on photograph was refused. Shoulders in frame, one person, facing forward.",
    error_apply_region_mismatch: "The garment covers a part of the body this photograph does not show. Step back, or pick a garment that matches the crop.",
    upload_blocked: "The browser could not reach the storage URL for the upload.",
    error_download_image: "The service could not download an image. The link may be blocked, or the upload did not finish.",
    error_upload: "The service could not store a result image.",
  };

  function YouCamError(message, extra) {
    const err = new Error(message || "The service returned an error.");
    err.name = "YouCamError";
    err.code = extra && extra.code ? extra.code : null;
    err.status = extra && extra.status ? extra.status : null;
    err.detail = extra && extra.detail ? extra.detail : null;
    return err;
  }

  function humanizeError(payload) {
    if (!payload) return "The service returned an error.";
    if (typeof payload === "string") return MESSAGES[payload] || payload;
    const code = payload.error_code || payload.code || null;
    if (typeof code === "string" && MESSAGES[code]) {
      const extra = payload.error_message && payload.error_message !== code ? " " + payload.error_message : "";
      return MESSAGES[code] + extra;
    }
    if (payload.error_message && typeof payload.error_message === "string") return payload.error_message;
    if (typeof payload.error === "string" && MESSAGES[payload.error]) return MESSAGES[payload.error];
    if (typeof payload.error === "string" && payload.error.length && payload.error.length < 300) return payload.error;
    return "The service returned an error.";
  }

  function resultImageUrl(data) {
    const node = data && data.data && (data.data.results || data.data.task_status) ? data.data : data;
    const results = (node && node.results) || {};
    if (typeof results.url === "string") return results.url;
    if (typeof results.download_url === "string") return results.download_url;
    if (Array.isArray(results.output)) {
      for (let i = 0; i < results.output.length; i += 1) {
        const item = results.output[i];
        if (item && typeof item.url === "string") return item.url;
      }
    }
    return null;
  }

  function anySignal(signals, ms) {
    const list = signals.filter(Boolean);
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      list.push(AbortSignal.timeout(ms));
    }
    if (list.length === 1) return list[0];
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function" && list.length) {
      return AbortSignal.any(list);
    }
    return list[0];
  }

  function createClient(options) {
    const base = (options && options.base ? options.base : "https://yce-api-01.makeupar.com").replace(/\/$/, "");
    const getKey = options && options.getKey ? options.getKey : function () { return ""; };
    const fetchImpl = (options && options.fetch) || fetch;

    async function api(path, opts) {
      const key = (getKey() || "").trim();
      if (!key) throw YouCamError(humanizeError({ code: "missing_key" }), { code: "missing_key" });
      const method = (opts && opts.method) || "GET";
      const headers = { Authorization: "Bearer " + key };
      if (opts && opts.json) headers["Content-Type"] = "application/json";
      let response;
      try {
        response = await fetchImpl(base + path, {
          method: method,
          headers: headers,
          body: opts && opts.json ? JSON.stringify(opts.json) : undefined,
          signal: anySignal([opts && opts.signal], (opts && opts.timeout) || 30000),
        });
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        throw YouCamError("The browser could not reach YouCam. " + (err && err.message ? err.message : ""), {
          code: "network",
        });
      }
      const text = await response.text();
      let body = null;
      if (text) {
        try { body = JSON.parse(text); }
        catch (e) { body = { error: text.slice(0, 300) }; }
      }
      if (!response.ok || (body && typeof body.status === "number" && body.status >= 400)) {
        throw YouCamError(humanizeError(body || {}), {
          status: response.status,
          code: body && (body.error_code || body.error),
          detail: body && body.error_message,
        });
      }
      return body;
    }

    async function uploadBlob(blob, filename, signal, onProgress) {
      const contentType = (blob && blob.type) || "image/jpeg";
      if (onProgress) onProgress({ phase: "register", filename: filename, bytes: blob.size });
      const registered = await api("/s2s/v2.0/file", {
        method: "POST",
        json: {
          files: [{ content_type: contentType, file_name: filename, file_size: blob.size }],
        },
        signal: signal,
      });
      const file = registered && registered.data && registered.data.files && registered.data.files[0];
      if (!file || !file.file_id) {
        throw YouCamError("The file service did not return a file id.", { detail: registered });
      }
      const requests = file.requests || file.request;
      const put = Array.isArray(requests) ? requests[0] : requests;
      if (!put || !put.url) throw YouCamError("The file service did not return an upload URL.", {});
      const headers = {};
      Object.keys(put.headers || {}).forEach(function (key) {
        if (/^(content-length|host)$/i.test(key)) return;
        headers[key] = put.headers[key];
      });
      const hasType = Object.keys(headers).some(function (key) { return key.toLowerCase() === "content-type"; });
      if (!hasType) headers["Content-Type"] = contentType;
      if (onProgress) onProgress({ phase: "upload", bytes: blob.size, filename: filename });
      let putResponse;
      try {
        putResponse = await fetchImpl(put.url, {
          method: String(put.method || "PUT").toUpperCase(),
          headers: headers,
          body: blob,
          signal: anySignal([signal], 60000),
        });
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        throw YouCamError(
          "The browser could not upload the photograph to storage. " + (err && err.message ? err.message : ""),
          { code: "upload_blocked" }
        );
      }
      if (!putResponse.ok) {
        let detail = "";
        try { detail = (await putResponse.text()).slice(0, 180); } catch (e) { detail = ""; }
        throw YouCamError("Storage refused the photograph (" + putResponse.status + "). " + detail, {
          status: putResponse.status,
          code: "upload_blocked",
        });
      }
      return file.file_id;
    }

    async function poll(path, opts) {
      const timeoutMs = (opts && opts.timeoutMs) || 120000;
      const intervalMs = (opts && opts.intervalMs) || 2500;
      const started = Date.now();
      let wait = 1200;
      while (Date.now() - started < timeoutMs) {
        if (opts && opts.signal && opts.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        await delay(wait, opts && opts.signal);
        wait = intervalMs;
        const body = await api(path, { method: "GET", signal: opts && opts.signal, timeout: 30000 });
        const data = (body && body.data) || {};
        const status = data.task_status || body.task_status;
        if (opts && opts.onProgress) {
          opts.onProgress({
            phase: "poll",
            status: status || "running",
            elapsed: Math.round((Date.now() - started) / 1000),
          });
        }
        if (status === "success") return body;
        if (status === "error") {
          throw YouCamError(humanizeError(data.error ? data : body), {
            code: data.error || (body && body.error),
            detail: data.error_message,
          });
        }
      }
      const seconds = Math.round(timeoutMs / 1000);
      throw YouCamError(
        "Still running after " + seconds + "s" + (opts && opts.taskId ? ". Task " + opts.taskId : "") +
          ". If it later succeeds, a unit may already be spent. Check the YouCam console before starting a duplicate.",
        { code: "timeout" }
      );
    }

    async function analyzeSkin(blob, opts) {
      const actions = (opts && opts.actions) || [];
      if (typeof globalThis !== "undefined" && globalThis.Honesty && globalThis.Honesty.assertUniform) {
        globalThis.Honesty.assertUniform(actions);
      }
      const signal = opts && opts.signal;
      const onProgress = opts && opts.onProgress;
      const fileId = await uploadBlob(blob, "honest-mirror-" + Date.now() + ".jpg", signal, onProgress);
      if (onProgress) onProgress({ phase: "task" });
      const created = await api("/s2s/v2.0/task/skin-analysis", {
        method: "POST",
        signal: signal,
        json: {
          src_file_id: fileId,
          dst_actions: actions,
          format: "json",
          miniserver_args: { enable_mask_overlay: false },
        },
      });
      const taskId = created && created.data && created.data.task_id;
      if (!taskId) throw YouCamError("Skin analysis did not return a task id.", { detail: created });
      if (onProgress) onProgress({ phase: "queued", taskId: taskId });
      const body = await poll("/s2s/v2.0/task/skin-analysis/" + encodeURIComponent(taskId), {
        signal: signal,
        onProgress: onProgress,
        taskId: taskId,
        timeoutMs: (opts && opts.timeoutMs) || 120000,
      });
      return { taskId: taskId, fileId: fileId, payload: body };
    }

    async function tryOn(opts) {
      const signal = opts && opts.signal;
      const onProgress = opts && opts.onProgress;
      const category = (opts && opts.category) || "auto";
      const srcId = await uploadBlob(opts.srcBlob, "tryon-src-" + Date.now() + ".jpg", signal, onProgress);
      const body = {
        src_file_id: srcId,
        garment_category: category,
        filter_multi_person: "normal",
      };
      if (category === "full_body" || category === "lower_body") {
        body.change_shoes = !!(opts && opts.changeShoes);
      }
      if (opts && opts.refUrl) body.ref_file_url = opts.refUrl;
      else body.ref_file_id = await uploadBlob(opts.refBlob, "garment-" + Date.now() + ".jpg", signal, onProgress);
      if (onProgress) onProgress({ phase: "task" });
      const created = await api("/s2s/v2.0/task/cloth-v4", {
        method: "POST",
        signal: signal,
        json: body,
      });
      const taskId = created && created.data && created.data.task_id;
      if (!taskId) throw YouCamError("Apparel try-on did not return a task id.", { detail: created });
      if (onProgress) onProgress({ phase: "queued", taskId: taskId });
      const polled = await poll("/s2s/v2.0/task/cloth-v4/" + encodeURIComponent(taskId), {
        signal: signal,
        onProgress: onProgress,
        taskId: taskId,
        timeoutMs: (opts && opts.timeoutMs) || 180000,
        intervalMs: 3000,
      });
      return {
        taskId: taskId,
        fileId: srcId,
        payload: polled,
        imageUrl: resultImageUrl(polled),
      };
    }

    async function pollExisting(kind, taskId, opts) {
      const path = kind === "cloth"
        ? "/s2s/v2.0/task/cloth-v4/" + encodeURIComponent(taskId)
        : "/s2s/v2.0/task/skin-analysis/" + encodeURIComponent(taskId);
      const body = await poll(path, {
        signal: opts && opts.signal,
        onProgress: opts && opts.onProgress,
        taskId: taskId,
        timeoutMs: (opts && opts.timeoutMs) || (kind === "cloth" ? 180000 : 120000),
        intervalMs: kind === "cloth" ? 3000 : 2500,
      });
      return { taskId: taskId, payload: body, imageUrl: resultImageUrl(body) };
    }

    return {
      analyzeSkin: analyzeSkin,
      tryOn: tryOn,
      pollExisting: pollExisting,
    };
  }

  function delay(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(function () {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      function onAbort() {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  return {
    createClient: createClient,
    humanizeError: humanizeError,
    resultImageUrl: resultImageUrl,
    YouCamError: YouCamError,
    MESSAGES: MESSAGES,
  };
});
