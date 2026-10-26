/* The Honest Mirror. Camera, YouCam skin reading, receipts, apparel try-on. */
(function () {
  "use strict";

  var SAMPLE_PATH = "assets/sample-portrait.png";

  var LOOKS = [
    {
      id: "coat",
      name: "Red rib and coat",
      category: "full_body",
      changeShoes: true,
      url: "https://plugins-media.makeupar.com/strapi/assets/clothes_reference_full_body_01_5a000d999f.png",
      alt: "Sample outfit from the YouCam docs: red ribbed top, pale coat, jeans.",
      credit: "Sample reference from the YouCam clothes documentation. Not a recommendation.",
    },
    {
      id: "sand",
      name: "Sand tee and jean",
      category: "full_body",
      changeShoes: true,
      url: "https://plugins-media.makeupar.com/strapi/assets/clothes_03_cccd5d4803.jpeg",
      alt: "Sample outfit from the YouCam docs: sand-colored tee, grey jeans, tan boots.",
      credit: "Sample photograph from the YouCam clothes documentation. Not a recommendation.",
    },
  ];

  var state = {
    step: "capture",
    purpose: "skin",
    stream: null,
    facing: "user",
    photo: null,
    tryonPhoto: null,
    engineChoice: "hd",
    parsed: null,
    decision: null,
    taskId: null,
    engine: "sd",
    rawPayload: null,
    rehearsal: false,
    selectedId: null,
    error: null,
    pendingSkin: null,
    pendingCloth: null,
    tryon: {
      lookId: "coat",
      category: "upper_body",
      changeShoes: true,
      customBlob: null,
      customUrl: null,
      customName: "",
      resultUrl: null,
      taskId: null,
      error: null,
      status: "",
      busy: false,
      useSkin: false,
    },
    cleanup: null,
    readingToken: 0,
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function safeUrl(url) {
    if (typeof url !== "string" || !url) return "";
    if (url.indexOf("blob:") === 0) return url;
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch (err) { return ""; }
    return "";
  }

  function config() {
    return window.HONEST_MIRROR_CONFIG || {};
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key) || ""; }
    catch (err) { return ""; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); }
    catch (err) { /* private mode */ }
  }

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); }
    catch (err) { /* private mode */ }
  }

  function sessionGet(key) {
    try {
      var raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function sessionSet(key, value) {
    try {
      if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
      else window.sessionStorage.removeItem(key);
    } catch (err) { /* ignore */ }
  }

  function freshPending(item) {
    if (!item || !item.id || !item.startedAt) return null;
    if (Date.now() - item.startedAt > 20 * 60 * 60 * 1000) return null;
    return item;
  }

  function currentKey() {
    var stored = storageGet("honestMirror.apiKey").trim();
    if (stored && !Honesty.isPlaceholderKey(stored)) return stored;
    var fileKey = String(config().apiKey || "").trim();
    if (fileKey && !Honesty.isPlaceholderKey(fileKey)) return fileKey;
    return "";
  }

  function keySource() {
    var stored = storageGet("honestMirror.apiKey").trim();
    if (stored && !Honesty.isPlaceholderKey(stored)) return "browser";
    var fileKey = String(config().apiKey || "").trim();
    if (fileKey && !Honesty.isPlaceholderKey(fileKey)) return "file";
    return "none";
  }

  function refreshKeyButton() {
    var button = document.getElementById("keyButton");
    var key = currentKey();
    button.textContent = key ? "Key ···" + key.slice(-4) : "Key needed";
    var source = document.getElementById("keySource");
    if (!source) return;
    if (keySource() === "browser") source.textContent = "Using a key saved in this browser.";
    else if (keySource() === "file") source.textContent = "Using the key in config.js. Nothing is saved in this browser yet.";
    else source.textContent = "No key yet. Readings and try-ons stay disabled until there is one.";
  }

  function client() {
    return YouCam.createClient({
      base: config().apiBase || "https://yce-api-01.makeupar.com",
      getKey: currentKey,
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function rail(current) {
    var steps = [
      ["capture", "Capture"],
      ["review", "Check"],
      ["reading", "Read"],
      ["report", "Report"],
    ];
    return '<ol class="rail">' + steps.map(function (step) {
      var attr = step[0] === current ? ' aria-current="step"' : "";
      return "<li" + attr + ">" + step[1] + "</li>";
    }).join("") + "</ol>";
  }

  function go(step) {
    state.step = step;
    try {
      history.pushState({ step: step }, "", location.href);
    } catch (err) { /* file:// */ }
    render();
  }

  function render() {
    if (state.step === "review" && !state.photo) state.step = "capture";
    if (state.cleanup) {
      var cleanup = state.cleanup;
      state.cleanup = null;
      cleanup();
    }
    var stage = document.getElementById("stage");
    var scroll = window.scrollY;
    if (state.step === "capture") stage.innerHTML = captureHtml();
    else if (state.step === "review") stage.innerHTML = reviewHtml();
    else if (state.step === "reading") stage.innerHTML = readingHtml();
    else stage.innerHTML = reportHtml();
    bind();
    if (state.keepScroll || state.step === "capture") window.scrollTo(0, scroll);
    else window.scrollTo(0, 0);
    state.keepScroll = false;
  }

  function captureHtml() {
    var specimen = Honesty.PUBLISHED_SPECIMEN;
    var title = state.purpose === "tryon"
      ? "Step back. Clothes need shoulders."
      : "The number they show, and the number they measured.";
    var lede = state.purpose === "tryon"
      ? "Apparel try-on wants the chest and shoulders, facing forward, one person. The close skin photograph is the wrong crop. Nothing about this picture changes the scores already on the report."
      : "YouCam returns two numbers. raw_score is the model. ui_score is adjusted to feel kinder, which their own docs describe as a psychological calibration. Beauty cameras lead with the kind one. This page leads with the raw one, and it will not sell you anything that number does not support.";
    var guide = state.purpose === "tryon"
      ? "Guide only. Shoulders inside the frame. Nothing is cropped."
      : "Guide only. Face across most of the width. Nothing is cropped.";
    return rail("capture") +
      pendingBanner() +
      errorBox(state.error) +
      '<div class="capture-grid">' +
        '<section class="thesis">' +
          '<p class="kicker">' + (state.purpose === "tryon" ? "Try-on photograph" : "A beauty camera that tells the truth") + "</p>" +
          '<h2 class="display">' + esc(title) + "</h2>" +
          '<p class="lede">' + esc(lede) + "</p>" +
          '<aside class="specimen">' +
            '<p class="kicker">' + esc(specimen.note) + "</p>" +
            '<p>' + esc(specimen.metric) + "</p>" +
            '<p class="specimen-raw">' + esc(Honesty.fmt(specimen.raw)) + " <span>raw</span></p>" +
            '<p class="filtered-claim">Filtered claim ' + esc(Honesty.fmt(specimen.ui)) + ". That gap is the product other cameras are selling.</p>" +
            '<p class="when-raw-only">The filtered number is hidden. The raw sample is ' + esc(Honesty.fmt(specimen.raw)) + ".</p>" +
            '<p class="fine filtered-claim">In that same published sample, firmness raw ' + esc(Honesty.fmt(specimen.firmnessRaw)) +
              " is shown as " + esc(specimen.firmnessUi) + ". The adjustment is not always upward. We still do not shop from it.</p>" +
            '<p class="fine when-raw-only">The published sample also moves some high scores. Those adjusted numbers are hidden.</p>' +
          "</aside>" +
          "<details><summary>What the model needs</summary>" +
          "<p>One face, front on, forehead visible, even light. For skin, the face should span most of the width. For clothes, include the shoulders. Glasses and makeup stay in the numbers if you leave them on. This page does not retouch the picture.</p>" +
          "<p class=\"fine\">The camera needs localhost or https. A file opened directly can still read a JPEG or PNG from disk.</p></details>" +
        "</section>" +
        '<section class="finder-col">' +
          '<div class="finder" id="finder">' +
            '<video id="video" autoplay muted playsinline></video>' +
            '<div class="guide" aria-hidden="true"></div>' +
            '<p class="hint" id="hint">' + esc(guide) + "</p>" +
          "</div>" +
          '<p class="fine" id="cameraNote"></p>' +
          '<div class="actions">' +
            '<button type="button" class="primary" id="shutter" disabled>Take the photograph</button>' +
            '<button type="button" class="ghost" id="flip">Flip camera</button>' +
            '<label class="file">Use a photograph<input id="file" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"></label>' +
            '<button type="button" class="ghost" id="sample">Use the sample photograph</button>' +
            (state.purpose === "tryon" ? '<button type="button" class="ghost" id="backReport">Back to the report</button>' : "") +
          "</div>" +
        "</section>" +
      "</div>";
  }

  function pendingBanner() {
    if (!state.pendingSkin) return "";
    return '<p class="note">A skin task is still open (' + esc(state.pendingSkin.id) +
      '). Resume it instead of spending another unit. <button type="button" class="ghost" id="resumeAnywhere">Resume</button></p>';
  }

  function reviewHtml() {
    var photo = state.photo;
    var eligible = Honesty.engineForDimensions(photo.width, photo.height);
    var engine = eligible === "hd" ? (state.engineChoice === "sd" ? "sd" : "hd") : "sd";
    state.engine = engine;
    var blocked = photo.warnings.some(function (item) { return item.block; });
    var soft = photo.warnings.some(function (item) { return !item.block; });
    var label = blocked ? "This frame will be refused" : (soft ? "Read this photograph anyway" : "Read this photograph");
    var hdDisabled = eligible !== "hd" ? " disabled" : "";
    return rail("review") +
      '<p class="kicker">Check the frame before spending a unit</p>' +
      '<h2 class="display">This is the photograph the model will see.</h2>' +
      errorBox(state.error) +
      '<div class="report-grid">' +
        plateHtml(photo, "Unretouched upload. Not cropped. Not graded.") +
        "<section>" +
          warningList(photo.warnings) +
          '<p class="fine">' + esc(photo.width) + "×" + esc(photo.height) + " · " + esc(formatBytes(photo.blob.size)) +
            (photo.luma == null ? "" : " · center light " + Math.round(photo.luma)) + "</p>" +
          "<fieldset><legend>Detail</legend>" +
            '<label class="check"><input type="radio" name="engine" value="sd"' + (engine === "sd" ? " checked" : "") + "> Standard detail · 16 scores · " + Honesty.unitCost(16, "sd") + " units</label>" +
            '<label class="check"><input type="radio" name="engine" value="hd"' + (engine === "hd" ? " checked" : "") + hdDisabled + "> High detail · regional pores and lines · " + Honesty.unitCost(16, "hd") + " units</label>" +
            '<p class="fine">' + (eligible === "hd"
              ? "The short side clears 1,080, so high detail is available. Standard is the same honesty rules, fewer units."
              : "Short side is under 1,080, so high detail would be refused. This reading uses standard detail.") + "</p>" +
          "</fieldset>" +
          "<p>" + esc(Honesty.unitSentence(engine)) + "</p>" +
          "<details><summary>Scores requested</summary><p>" +
            Honesty.actionsFor(engine).map(function (action) { return esc(Honesty.actionLabel(action)); }).join(" · ") +
          "</p></details>" +
          '<div class="actions">' +
            '<button type="button" class="primary" id="read" data-label="' + esc(label) + '"' + (blocked ? " disabled" : "") + ">" +
              esc(currentKey() ? label : "Add an API key") + "</button>" +
            (state.pendingSkin ? '<button type="button" class="ghost" id="resume">Resume open task</button>' : "") +
            '<button type="button" class="ghost" id="retake">Retake</button>' +
          "</div>" +
          '<p class="fine">Failures should not spend a unit. A success does. Leaving after the task is accepted does not cancel it.</p>' +
        "</section>" +
      "</div>";
  }

  function readingHtml() {
    var photo = state.photo;
    return rail("reading") +
      '<p class="kicker">YouCam Skin Analysis</p>' +
      '<h2 class="display">Reading the photograph.</h2>' +
      '<div class="reading-layout">' +
        (photo ? plateHtml(photo, "These pixels were uploaded. Nothing was smoothed.") : "") +
        "<section>" +
          '<div class="pending" aria-hidden="true"></div>' +
          '<p id="read-status" role="status">Filing the photograph.</p>' +
          '<ol id="read-log"></ol>' +
          '<div class="actions"><button type="button" class="ghost" id="stopRead">Stop waiting</button></div>' +
          '<p class="fine">Stopping the wait does not refund a task the service already accepted. You can resume it from the check screen.</p>' +
        "</section>" +
      "</div>";
  }

  function reportHtml() {
    var parsed = state.parsed;
    var decision = state.decision;
    if (!parsed || !decision) {
      return rail("report") + "<p>No reading yet.</p>";
    }
    var lead = Honesty.leadMetric(parsed.metrics);
    state.selectedId = state.selectedId && parsed.metrics.some(function (metric) { return metric.id === state.selectedId; })
      ? state.selectedId
      : (lead ? lead.id : null);
    return rail("report") +
      '<p class="kicker">' + (state.rehearsal ? "Rehearsal layout" : "Honesty report") + "</p>" +
      '<h2 class="display">What the camera actually sees.</h2>' +
      '<p class="ruling">' + esc(decision.ruling) + "</p>" +
      (decision.kindness ? '<p class="filtered-claim lede">' + esc(decision.kindness.text) + "</p>" : "") +
      '<p class="when-raw-only fine">The filtered claim is hidden. Every number still on the page is raw.</p>' +
          '<p class="fine">' + esc(Honesty.SCALE_NOTE) + "</p>" +
          '<p class="fine">Black mark on each ruler: the raw score, 1 at the left and 100 at the right. <span class="filtered-claim">Rose mark: the filtered claim.</span></p>' +
      '<div class="report-grid">' +
        '<div class="photo-col">' +
          (state.photo
            ? plateHtml(state.photo, plateCaption())
            : '<figure class="plate"><div class="empty-frame">No photograph retained.</div><figcaption>' + esc(plateCaption()) + "</figcaption></figure>") +
          '<figure class="evidence"><img id="mask" alt="" hidden><figcaption id="mask-cap"></figcaption></figure>' +
        "</div>" +
        "<section>" +
          meanBlock(parsed) +
          skinBlock(parsed) +
          '<div class="metric-list" id="metrics">' + parsed.metrics.map(metricButton).join("") + "</div>" +
          '<p class="fine">' + esc(Honesty.DISCLAIMER) + "</p>" +
        "</section>" +
      "</div>" +
      '<h2 class="section-title">What the data will support</h2>' +
      '<p>There is no checkout. If you buy something, do it somewhere else, and only if you still want it after reading the receipt.</p>' +
      '<div class="shelf">' + (decision.offers.length
        ? decision.offers.map(receiptHtml).join("")
        : '<article class="receipt offer"><p class="tag offer">Receipt</p><h3>Nothing</h3><p>' + esc(decision.ruling) + "</p></article>") +
      "</div>" +
      '<h2 class="section-title">Refused</h2>' +
      '<p>These were considered. The metric that kept them off the list is the point.</p>' +
      '<div class="shelf refused">' + decision.declines.map(declineHtml).join("") + "</div>" +
      '<div id="tryon-root"></div>' +
      "<details class=\"raw\"><summary id=\"raw-summary\">Service response, unedited</summary><pre id=\"rawjson\"></pre></details>" +
      '<div class="actions"><button type="button" class="ghost" id="again">New photograph</button></div>';
  }

  function plateCaption() {
    if (state.rehearsal) return "Sample photograph. The scores on this page were not measured from this picture.";
    var bits = ["Unretouched upload"];
    if (state.photo) bits.push(state.photo.width + "×" + state.photo.height);
    bits.push(state.engine === "hd" ? "high detail" : "standard detail");
    if (state.taskId) bits.push("task " + state.taskId);
    return bits.join(" · ");
  }

  function plateHtml(photo, caption) {
    var url = safeUrl(photo.url);
    var alt = state.rehearsal
      ? "Sample photograph. Not a reading of this picture."
      : "The photograph that was submitted, without retouching";
    return '<figure class="plate"><img alt="' + esc(alt) + '" src="' + esc(url) + '"><figcaption>' + esc(caption) + "</figcaption></figure>";
  }

  function warningList(warnings) {
    if (!warnings || !warnings.length) return '<p class="fine">No problems spotted in this frame. The model can still refuse it.</p>';
    return warnings.map(function (item) {
      return '<p class="' + (item.block ? "alert" : "note") + '">' + esc(item.text) + "</p>";
    }).join("");
  }

  function errorBox(message) {
    if (!message) return "";
    return '<p class="alert" role="alert">' + esc(message) + "</p>";
  }

  function meanBlock(parsed) {
    var html = '<div class="means"><p class="mean-num">' + esc(Honesty.fmt(parsed.rawMean)) + ' <span>raw average</span></p>';
    html += '<p class="mean-num filtered-claim">' + esc(Honesty.fmt(parsed.uiMean)) + ' <span>filtered average</span></p></div>';
    if (parsed.apiOverall != null) {
      html += '<p class="fine">YouCam returned an overall of ' + esc(Honesty.fmt(parsed.apiOverall)) + ". The averages above are computed on this page.</p>";
    } else {
      html += '<p class="fine">YouCam did not return a separate overall. These averages are the whole-face scores on this page.</p>';
    }
    return html;
  }

  function skinBlock(parsed) {
    var skin = parsed.skin || { zones: {} };
    var html = '<div class="skin-block">';
    if (skin.label) {
      var zones = Object.keys(skin.zones).filter(function (key) { return key !== "whole"; })
        .map(function (key) { return Honesty.regionLabel(key) + " " + skin.zones[key]; });
      html += '<p class="kicker">Skin type</p><h3>' + esc(skin.label) + "</h3>";
      if (zones.length) html += '<p class="fine">' + esc(zones.join(" · ")) + "</p>";
      html += '<p class="fine">A classification, not a score. There is no higher.</p>';
    } else {
      html += '<p class="fine">Skin type did not come back as a class. Rules that need it stay conservative.</p>';
    }
    if (parsed.skinAge != null) {
      html += '<p class="kicker">Skin age</p><p class="specimen-raw" style="font-size:48px">' + esc(Honesty.fmt(parsed.skinAge)) + "</p>";
      html += '<p class="fine">The model’s placement of this photograph against its training distribution. Not a birthday, and not a reason to buy.</p>';
    }
    html += "</div>";
    return html;
  }

  function metricButton(metric) {
    var pressed = metric.id === state.selectedId ? "true" : "false";
    var raw = metric.raw == null ? "—" : Honesty.fmt(metric.raw);
    var ruler = '<div class="ruler" aria-hidden="true">';
    if (metric.raw != null) ruler += '<i class="raw" style="left:' + clampPct(metric.raw) + '%"></i>';
    if (metric.ui != null) ruler += '<i class="ui filtered-claim" style="left:' + clampPct(metric.ui) + '%"></i>';
    ruler += "</div>";
    var regions = metric.regions.length
      ? '<ul class="regions">' + metric.regions.map(function (region) {
        return "<li>" + esc(region.label) + " " + esc(Honesty.fmt(region.raw)) +
          '<span class="filtered-claim"> / ' + esc(Honesty.fmt(region.ui)) + "</span></li>";
      }).join("") + "</ul>"
      : "";
    return '<button type="button" class="metric" data-id="' + esc(metric.id) + '" aria-pressed="' + pressed + '">' +
      "<span><strong>" + esc(metric.label) + "</strong></span>" +
      '<span class="raw-num">' + esc(raw) + " <span>raw</span></span>" +
      (metric.sees ? '<p class="sees what">' + esc(metric.sees) + "</p>" : "") +
      '<p class="sees">' + esc(Honesty.readingSentence(metric)) + "</p>" +
      '<p class="sees filtered-claim">' + esc(Honesty.filteredSentence(metric)) + "</p>" +
      ruler + regions + "</button>";
  }

  function clampPct(n) {
    return Math.max(0, Math.min(100, n));
  }

  function receiptHtml(item, index) {
    var receipt = item.receipt;
    var number = String(index + 1).padStart(2, "0");
    return '<article class="receipt offer"><p class="tag offer">Receipt ' + number + "</p><h3>" + esc(item.name) + "</h3>" +
      "<p>Triggered by " + esc(receipt.label.toLowerCase()) + ", raw " + esc(Honesty.fmt(receipt.raw)) +
      ". The line for this product is below " + esc(receipt.line) + ".</p>" +
      '<p class="filtered-claim">A filtered camera would have said ' + esc(Honesty.fmt(receipt.ui)) + ".</p>" +
      (receipt.note ? "<p>" + esc(receipt.note) + "</p>" : "") +
      "<p>" + esc(receipt.confidenceText) + "</p>" +
      '<p class="blurb">' + esc(item.blurb) + "</p></article>";
  }

  function declineHtml(item) {
    return '<article class="receipt refuse"><p class="tag refuse">Refused</p><h3>' + esc(item.name) + "</h3><p>" + esc(item.reason) + "</p></article>";
  }

  function bind() {
    if (state.step === "capture") bindCapture();
    else if (state.step === "review") bindReview();
    else if (state.step === "reading") bindReading();
    else bindReport();
    var resume = document.getElementById("resumeAnywhere");
    if (resume) resume.onclick = function () { beginResume(); };
  }

  function bindCapture() {
    var video = document.getElementById("video");
    var shutter = document.getElementById("shutter");
    var hint = document.getElementById("hint");
    var note = document.getElementById("cameraNote");
    var token = { stopped: false };
    state.cleanup = function () {
      token.stopped = true;
      stopStream();
    };
    var secure = window.isSecureContext;
    var media = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!secure || !media) {
      note.textContent = secure
        ? "This browser has no camera API. Use a JPEG or PNG instead."
        : "The camera needs localhost or https. You can still open a JPEG or PNG from disk.";
    } else {
      startCamera(video, shutter, hint, note, token);
    }
    shutter.onclick = function () { takePhoto(video, true); };
    document.getElementById("flip").onclick = function () {
      state.facing = state.facing === "user" ? "environment" : "user";
      startCamera(video, shutter, hint, note, token);
    };
    document.getElementById("file").onchange = function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) ingestFile(file);
    };
    document.getElementById("sample").onclick = function () { loadSample(); };
    var finder = document.getElementById("finder");
    finder.addEventListener("dragover", function (event) { event.preventDefault(); });
    finder.addEventListener("drop", function (event) {
      event.preventDefault();
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) ingestFile(file);
    });
    var back = document.getElementById("backReport");
    if (back) back.onclick = function () {
      state.purpose = "skin";
      go("report");
    };
  }

  async function startCamera(video, shutter, hint, note, token) {
    stopStream();
    shutter.disabled = true;
    try {
      var stream = await openStream(state.facing);
      if (token.stopped) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      state.stream = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.classList.toggle("mirrored", state.facing === "user");
      video.onloadedmetadata = function () {
        if (!token.stopped && video.videoWidth) shutter.disabled = false;
      };
      await Promise.race([
        video.play().catch(function () { return null; }),
        new Promise(function (resolve) { setTimeout(resolve, 1200); }),
      ]);
      if (token.stopped) return;
      if (video.videoWidth) {
        shutter.disabled = false;
        note.textContent = "The frame in the window is the frame that will be uploaded.";
        watch(video, hint, token);
      } else {
        note.textContent = "The camera has not produced a frame. You can still use a JPEG or PNG from disk.";
      }
    } catch (err) {
      if (token.stopped) return;
      shutter.disabled = true;
      note.textContent = cameraMessage(err);
    }
  }

  function cameraMessage(err) {
    var name = err && err.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera permission was denied. You can still use a photograph from disk.";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera was found. Use a photograph from disk.";
    if (name === "NotReadableError") return "The camera is busy in another app.";
    return "The camera could not start. Use a photograph from disk.";
  }

  async function openStream(facing) {
    var attempts = [
      { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false },
      { video: { facingMode: facing }, audio: false },
      { video: true, audio: false },
    ];
    var last;
    for (var i = 0; i < attempts.length; i += 1) {
      try { return await navigator.mediaDevices.getUserMedia(attempts[i]); }
      catch (err) { last = err; }
    }
    throw last;
  }

  function stopStream() {
    if (!state.stream) return;
    state.stream.getTracks().forEach(function (track) { track.stop(); });
    state.stream = null;
  }

  function watch(video, hint, token) {
    var last = 0;
    var detector = null;
    if ("FaceDetector" in window) {
      try { detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 2 }); }
      catch (err) { detector = null; }
    }
    async function tick(now) {
      if (token.stopped) return;
      if (now - last > 800 && video.videoWidth) {
        last = now;
        var bits = [video.videoWidth + "×" + video.videoHeight];
        var luma = sampleVideoLuma(video);
        if (luma != null) {
          if (luma < 45) bits.push("dark");
          else if (luma > 230) bits.push("hot light");
          else bits.push("light ok");
        }
        if (detector) {
          try {
            var faces = await detector.detect(video);
            if (token.stopped) return;
            if (!faces.length) bits.push("no face yet");
            else if (faces.length > 1) bits.push("more than one face");
            else {
              var ratio = faces[0].boundingBox.width / video.videoWidth;
              if (state.purpose === "skin" && ratio < 0.45) bits.push("move closer");
              else if (state.purpose === "tryon" && ratio > 0.8) bits.push("step back for shoulders");
              else bits.push("one face");
            }
          } catch (err) { /* detector is optional */ }
        }
        hint.textContent = bits.join(" · ") + " · guide only, nothing is cropped";
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function sampleVideoLuma(video) {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      var side = Math.min(video.videoWidth, video.videoHeight) * 0.4;
      var sx = (video.videoWidth - side) / 2;
      var sy = (video.videoHeight - side) / 2;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, 24, 24);
      return centerLuma(ctx, 24, 24);
    } catch (err) { return null; }
  }

  function centerLuma(ctx, w, h) {
    var data = ctx.getImageData(0, 0, w, h).data;
    var sum = 0;
    var count = 0;
    for (var i = 0; i < data.length; i += 16) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count += 1;
    }
    return count ? sum / count : null;
  }

  async function takePhoto(video) {
    if (!video.videoWidth) return;
    var frame = await frameFromSource(video, {
      mirror: state.facing === "user",
      purpose: state.purpose,
    });
    adopt(frame);
  }

  async function sampleFrame(purpose) {
    var response = await fetch(SAMPLE_PATH);
    if (!response.ok) throw new Error("missing sample");
    var blob = await response.blob();
    var url = URL.createObjectURL(blob);
    try {
      var image = await loadImage(url);
      var frame = await frameFromSource(image, { mirror: false, purpose: purpose || "skin" });
      frame.sample = true;
      return frame;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadSample() {
    var note = document.getElementById("cameraNote");
    var button = document.getElementById("sample");
    if (button) button.disabled = true;
    if (note) note.textContent = "Loading the sample photograph.";
    try {
      adopt(await sampleFrame(state.purpose));
    } catch (err) {
      state.error = "The sample photograph could not be loaded. Serve this folder with a local web server, then try again.";
      render();
    }
  }

  async function ingestFile(file) {
    if (/heic|heif/i.test(file.type || "") || /\.heic$/i.test(file.name || "")) {
      state.error = "HEIC is not supported. Export a JPEG or PNG.";
      go(state.purpose === "tryon" ? "report" : "capture");
      return;
    }
    var url = URL.createObjectURL(file);
    try {
      var image = await loadImage(url);
      var frame = await frameFromSource(image, { mirror: false, purpose: state.purpose });
      adopt(frame);
    } catch (err) {
      state.error = "That file could not be read as a JPEG or PNG.";
      if (state.purpose === "tryon") go("report");
      else render();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("unreadable")); };
      image.src = url;
    });
  }

  async function frameFromSource(source, options) {
    var sw = source.videoWidth || source.naturalWidth || source.width;
    var sh = source.videoHeight || source.naturalHeight || source.height;
    var long = Math.max(sw, sh);
    var scale = long > 2560 ? 2560 / long : 1;
    var w = Math.max(1, Math.round(sw * scale));
    var h = Math.max(1, Math.round(sh * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, w, h);
    }
    if (options.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, w, h);
    var luma = null;
    try { luma = centerLuma(ctx, w, h); } catch (err) { luma = null; }
    var faces = await countFaces(canvas);
    var blob = await encodeJpeg(canvas);
    return {
      blob: blob,
      width: w,
      height: h,
      luma: luma,
      faces: faces.faces,
      ratio: faces.ratio,
      warnings: [],
      purpose: options.purpose,
    };
  }

  async function encodeJpeg(canvas) {
    var quality = 0.92;
    var blob = await canvasBlob(canvas, "image/jpeg", quality);
    while (blob.size > 9.2 * 1024 * 1024 && quality > 0.55) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, "image/jpeg", quality);
    }
    return blob;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error("The photograph could not be encoded."));
        else resolve(blob);
      }, type, quality);
    });
  }

  async function countFaces(canvas) {
    if (!("FaceDetector" in window)) return { faces: null, ratio: null };
    try {
      var detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      var faces = await detector.detect(canvas);
      var ratio = null;
      if (faces[0] && faces[0].boundingBox) ratio = faces[0].boundingBox.width / canvas.width;
      return { faces: faces.length, ratio: ratio };
    } catch (err) {
      return { faces: null, ratio: null };
    }
  }

  function decorate(frame) {
    frame.warnings = buildWarnings(frame, frame.purpose || state.purpose);
    return frame;
  }

  function buildWarnings(info, purpose) {
    var warnings = [];
    var short = Math.min(info.width, info.height);
    var long = Math.max(info.width, info.height);
    if (purpose !== "tryon" && short < 480) {
      warnings.push({ block: true, text: "Short side is " + short + "px. Skin analysis needs at least 480." });
    }
    if (purpose === "tryon" && (long < 512 || short < 384)) {
      warnings.push({ block: true, text: "Try-on wants at least 512×384. This frame is " + info.width + "×" + info.height + "." });
    }
    if (info.luma != null && info.luma < 45) {
      warnings.push({ block: false, text: "The center of this frame is very dark. The model often refuses dark photographs." });
    }
    if (info.luma != null && info.luma > 230) {
      warnings.push({ block: false, text: "The center of this frame is blown out. Ease the light and try again." });
    }
    if (info.sample) {
      warnings.push({
        block: false,
        text: "Bundled sample photograph. Another person is partly in the lower left, and glasses and a cap are in frame. A live reading is steadier with one face and the forehead visible.",
      });
    }
    if (info.faces === 0) {
      warnings.push({ block: false, text: "This browser did not find a face. YouCam may still see one. A refusal should not spend a unit." });
    }
    if (info.faces > 1) {
      warnings.push({ block: false, text: "More than one face is in frame. Use a photograph of one person." });
    }
    if (purpose !== "tryon" && info.faces === 1 && info.ratio != null && info.ratio < 0.45) {
      warnings.push({ block: false, text: "The face looks small. Skin analysis wants it across most of the width." });
    }
    if (purpose === "tryon" && info.faces === 1 && info.ratio != null && info.ratio > 0.78) {
      warnings.push({ block: false, text: "This looks like a tight face crop. Try-on needs shoulders in the frame." });
    }
    return warnings;
  }

  function adopt(frame) {
    decorate(frame);
    state.error = null;
    if (state.purpose === "tryon") {
      if (state.tryonPhoto && state.tryonPhoto.url) URL.revokeObjectURL(state.tryonPhoto.url);
      frame.url = URL.createObjectURL(frame.blob);
      state.tryonPhoto = frame;
      state.purpose = "skin";
      go("report");
      return;
    }
    if (state.photo && state.photo.url) URL.revokeObjectURL(state.photo.url);
    frame.url = URL.createObjectURL(frame.blob);
    state.photo = frame;
    var eligible = Honesty.engineForDimensions(frame.width, frame.height);
    state.engine = eligible === "hd" && state.engineChoice !== "sd" ? "hd" : "sd";
    go("review");
  }

  function bindReview() {
    var radios = document.querySelectorAll('input[name="engine"]');
    radios.forEach(function (radio) {
      radio.onchange = function () {
        if (!radio.checked) return;
        state.engineChoice = radio.value;
        state.engine = radio.value;
        state.keepScroll = true;
        render();
      };
    });
    var read = document.getElementById("read");
    if (read) {
      read.onclick = function () {
        if (!currentKey()) { openKey(); return; }
        beginFresh();
      };
    }
    var resume = document.getElementById("resume");
    if (resume) resume.onclick = beginResume;
    document.getElementById("retake").onclick = function () {
      state.purpose = "skin";
      state.error = null;
      go("capture");
    };
  }

  function beginFresh() {
    state.readingMode = "fresh";
    state.armReading = true;
    state.error = null;
    go("reading");
  }

  function beginResume() {
    if (!state.pendingSkin) return;
    if (!currentKey()) { openKey(); return; }
    state.readingMode = "resume";
    state.armReading = true;
    state.engine = state.pendingSkin.engine || state.engine;
    state.error = null;
    go("reading");
  }

  function bindReading() {
    var stop = document.getElementById("stopRead");
    if (!state.armReading) {
      var status = document.getElementById("read-status");
      if (status) {
        status.textContent = state.parsed
          ? "This reading already finished. Going back does not start another one."
          : "The wait was left. Resume an open task if there is one, so a second unit is not spent.";
      }
      stop.textContent = state.parsed ? "Back to the report" : "Back";
      stop.onclick = function () { go(state.parsed ? "report" : (state.photo ? "review" : "capture")); };
      return;
    }
    state.armReading = false;
    var token = ++state.readingToken;
    var controller = new AbortController();
    state.cleanup = function () { controller.abort(); };
    stop.onclick = function () {
      controller.abort();
      go(state.photo ? "review" : "capture");
    };
    if (state.readingMode === "resume") resumeSkin(token, controller);
    else runSkin(token, controller);
  }

  async function runSkin(token, controller) {
    var actions = Honesty.actionsFor(state.engine);
    try {
      Honesty.assertUniform(actions);
      var result = await client().analyzeSkin(state.photo.blob, {
        actions: actions,
        signal: controller.signal,
        onProgress: function (event) {
          if (event.taskId) rememberSkin(event.taskId);
          paintProgress(event);
        },
      });
      if (token !== state.readingToken) return;
      finishSkin(result);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (token !== state.readingToken) return;
      if (!keepPending(err)) {
        state.pendingSkin = null;
        sessionSet("honestMirror.pendingSkin", null);
      }
      state.error = err.message || "The reading failed.";
      go(state.photo ? "review" : "capture");
    }
  }

  function keepPending(err) {
    if (!err || err.name === "AbortError") return true;
    return err.code === "timeout" || err.code === "network" || err.code === "upload_blocked";
  }

  async function resumeSkin(token, controller) {
    try {
      paintProgress({ phase: "poll", status: "running", elapsed: 0 });
      var result = await client().pollExisting("skin", state.pendingSkin.id, {
        signal: controller.signal,
        onProgress: paintProgress,
      });
      if (token !== state.readingToken) return;
      finishSkin(result);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (token !== state.readingToken) return;
      if (!keepPending(err)) {
        state.pendingSkin = null;
        sessionSet("honestMirror.pendingSkin", null);
      }
      state.error = err.message || "The open task could not be resumed.";
      go(state.photo ? "review" : "capture");
    }
  }

  function rememberSkin(taskId) {
    state.pendingSkin = { id: taskId, engine: state.engine, kind: "skin", startedAt: Date.now() };
    sessionSet("honestMirror.pendingSkin", state.pendingSkin);
  }

  function finishSkin(result) {
    state.pendingSkin = null;
    sessionSet("honestMirror.pendingSkin", null);
    state.taskId = result.taskId;
    state.rawPayload = result.payload;
    state.parsed = Honesty.parseAnalysis(result.payload);
    state.decision = Honesty.audit(state.parsed);
    state.selectedId = null;
    go("report");
  }

  function paintProgress(event) {
    var status = document.getElementById("read-status");
    var text = phaseText(event);
    if (status) status.textContent = text;
    var list = document.getElementById("read-log");
    if (!list) return;
    var last = list.lastElementChild;
    if (!last || last.dataset.phase !== event.phase) {
      var item = document.createElement("li");
      item.dataset.phase = event.phase;
      item.textContent = text;
      list.appendChild(item);
    } else {
      last.textContent = text;
    }
  }

  function phaseText(event) {
    if (event.phase === "register") return "Registering the file (" + formatBytes(event.bytes || 0) + ")";
    if (event.phase === "upload") return "Uploading " + formatBytes(event.bytes || 0);
    if (event.phase === "task") return "Starting the task";
    if (event.phase === "queued") return "Task accepted";
    if (event.phase === "poll") return "Model running · " + (event.elapsed || 0) + "s · " + (event.status || "running");
    return "Working";
  }

  function bindReport() {
    document.querySelectorAll("button.metric").forEach(function (button) {
      button.onclick = function () { selectMetric(button.getAttribute("data-id")); };
    });
    if (state.selectedId) selectMetric(state.selectedId);
    var summary = document.getElementById("raw-summary");
    var raw = document.getElementById("rawjson");
    if (summary) {
      summary.textContent = state.rehearsal
        ? "Rehearsal payload, not a service response"
        : "Service response, unedited";
    }
    if (raw) raw.textContent = JSON.stringify(state.rawPayload, null, 2);
    document.getElementById("again").onclick = function () {
      state.purpose = "skin";
      state.error = null;
      state.rehearsal = false;
      var banner = document.getElementById("rehearsalBanner");
      if (banner) banner.hidden = true;
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete("preview");
        history.replaceState({ step: "capture" }, "", url.pathname + url.search + url.hash);
      } catch (err) { /* file:// */ }
      go("capture");
    };
    paintTryOn();
  }

  function selectMetric(id) {
    state.selectedId = id;
    document.querySelectorAll("button.metric").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-id") === id ? "true" : "false");
    });
    var metric = state.parsed.metrics.find(function (item) { return item.id === id; });
    var image = document.getElementById("mask");
    var caption = document.getElementById("mask-cap");
    if (!metric || !caption) return;
    var url = safeUrl(metric.maskUrl || "");
    if (!url) {
      image.hidden = true;
      image.removeAttribute("src");
      caption.textContent = "No detection mask was returned for " + metric.label + ".";
      return;
    }
    image.hidden = false;
    image.alt = "Detection mask for " + metric.label + ". Not a retouch.";
    image.src = url;
    caption.textContent = "Detection mask for " + metric.label + ". Where the model marked the photograph. Not a retouch.";
    image.onerror = function () {
      image.hidden = true;
      caption.textContent = "A mask URL came back for " + metric.label + ", and the browser could not display it. It may have expired.";
    };
  }

  function paintTryOn() {
    var root = document.getElementById("tryon-root");
    if (!root) return;
    var custom = !!state.tryon.customBlob;
    var source = tryonSource();
    var blocked = source && source.warnings && source.warnings.some(function (item) { return item.block; });
    var looks = LOOKS.map(function (look) {
      var pressed = !custom && state.tryon.lookId === look.id;
      return '<button type="button" class="look" data-look="' + esc(look.id) + '" aria-pressed="' + pressed + '">' +
        '<img alt="' + esc(look.alt) + '" src="' + esc(look.url) + '" referrerpolicy="no-referrer">' +
        "<span>" + esc(look.name) + "</span></button>";
    }).join("");
    var sourceFig = source
      ? '<figure><img alt="Photograph that will be sent to apparel try-on" src="' + esc(safeUrl(source.url)) + '"><figcaption>' +
        esc(source.width + "×" + source.height) + "</figcaption></figure>"
      : "<p>No try-on photograph yet.</p>";
    var result = state.tryon.resultUrl
      ? '<figure><img alt="Apparel try-on result from YouCam" src="' + esc(safeUrl(state.tryon.resultUrl)) + '" id="tryonResult"><figcaption>Apparel model output. Skin scores above did not change.</figcaption></figure>'
      : "<figure><figcaption>The try-on image will land here. It is a picture of fabric, not a treatment.</figcaption></figure>";
    root.innerHTML =
      '<h2 class="section-title">Clothes, without a receipt</h2>' +
      "<p>No skin metric selected these. The honesty layer does not sell clothes. Fabric is not a treatment, and trying one on does not move a score.</p>" +
      '<p class="fine">Each try-on is its own YouCam task. A unit is spent when it succeeds. Use a photograph with shoulders, one person, facing forward. Full outfits need the body the garment covers.</p>' +
      (state.pendingCloth ? '<p class="note">An apparel task is still open (' + esc(state.pendingCloth.id) + '). <button type="button" class="ghost" id="resumeCloth">Resume it</button></p>' : "") +
      errorBox(state.tryon.error) +
      '<p id="tryon-status" role="status">' + esc(state.tryon.status || "") + "</p>" +
      '<div class="looks">' + looks + "</div>" +
      '<p class="fine">' + esc((LOOKS.find(function (look) { return look.id === state.tryon.lookId; }) || LOOKS[0]).credit) + "</p>" +
      '<div class="actions">' +
        '<label class="file">Your garment<input id="garmentFile" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"></label>' +
        (custom ? '<button type="button" class="ghost" id="clearGarment">Use the samples instead</button>' : "") +
      "</div>" +
      (custom
        ? '<p class="fine">Using ' + esc(state.tryon.customName || "your garment") + ".</p>"
        : '<p class="fine">Sample outfits keep the category they were built with. Upload a garment to choose a different one.</p>') +
      '<label>Category <select id="garmentCategory"' + (custom ? "" : " disabled") + ">" +
        categoryOptions() +
      "</select></label>" +
      '<label class="check"><input id="changeShoes" type="checkbox"' + (state.tryon.changeShoes ? " checked" : "") + "> Include shoes from a full-body reference</label>" +
      '<div class="actions">' +
        '<button type="button" class="ghost" id="takeTryon">Take a wider photograph</button>' +
        '<label class="file">Upload a try-on photograph<input id="tryonFile" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"></label>' +
      "</div>" +
      (state.photo ? '<label class="check"><input id="useSkin" type="checkbox"' + (state.tryon.useSkin ? " checked" : "") + "> Use the skin photograph. Tight face crops often fail try-on.</label>" : "") +
      (source && source.warnings ? warningList(source.warnings) : "") +
      '<div class="actions"><button type="button" class="primary" id="runTryon"' + (state.tryon.busy || !source || blocked ? " disabled" : "") + ">" +
        (state.tryon.busy ? "Trying it on" : "Try this on") + "</button></div>" +
      '<div class="compare">' + sourceFig + result + "</div>";
    bindTryOn();
  }

  function categoryOptions() {
    var categories = [
      ["auto", "Auto"],
      ["upper_body", "Upper body"],
      ["outer", "Outerwear"],
      ["full_body", "Full body"],
      ["lower_body", "Lower body"],
      ["shoes", "Shoes"],
    ];
    var current = state.tryon.customBlob
      ? state.tryon.category
      : (LOOKS.find(function (look) { return look.id === state.tryon.lookId; }) || LOOKS[0]).category;
    return categories.map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === current ? " selected" : "") + ">" + item[1] + "</option>";
    }).join("");
  }

  function bindTryOn() {
    document.querySelectorAll("button.look").forEach(function (button) {
      button.onclick = function () {
        state.tryon.lookId = button.getAttribute("data-look");
        if (state.tryon.customUrl) URL.revokeObjectURL(state.tryon.customUrl);
        state.tryon.customBlob = null;
        state.tryon.customUrl = null;
        state.tryon.customName = "";
        var look = LOOKS.find(function (item) { return item.id === state.tryon.lookId; });
        state.tryon.changeShoes = !!(look && look.changeShoes);
        state.tryon.error = null;
        paintTryOn();
      };
    });
    var garment = document.getElementById("garmentFile");
    if (garment) garment.onchange = function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) setGarment(file);
    };
    var clear = document.getElementById("clearGarment");
    if (clear) clear.onclick = function () {
      if (state.tryon.customUrl) URL.revokeObjectURL(state.tryon.customUrl);
      state.tryon.customBlob = null;
      state.tryon.customUrl = null;
      state.tryon.customName = "";
      paintTryOn();
    };
    var category = document.getElementById("garmentCategory");
    if (category) category.onchange = function () { state.tryon.category = category.value; };
    var shoes = document.getElementById("changeShoes");
    if (shoes) shoes.onchange = function () { state.tryon.changeShoes = shoes.checked; };
    document.getElementById("takeTryon").onclick = function () {
      state.purpose = "tryon";
      go("capture");
    };
    document.getElementById("tryonFile").onchange = function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      state.purpose = "tryon";
      ingestFile(file);
    };
    var useSkin = document.getElementById("useSkin");
    if (useSkin) useSkin.onchange = function () {
      state.tryon.useSkin = useSkin.checked;
      paintTryOn();
    };
    var run = document.getElementById("runTryon");
    if (run) run.onclick = runTryOn;
    var resume = document.getElementById("resumeCloth");
    if (resume) resume.onclick = resumeCloth;
    var result = document.getElementById("tryonResult");
    if (result) result.onerror = function () {
      state.tryon.error = "The result URL came back, and the browser could not display it. It may have expired.";
      paintTryOn();
    };
  }

  async function setGarment(file) {
    try {
      if (/heic|heif/i.test(file.type || "")) throw new Error("HEIC is not supported. Export a JPEG or PNG.");
      var blob = file;
      if (!(file.type === "image/png" && file.size < 9 * 1024 * 1024)) {
        var url = URL.createObjectURL(file);
        try {
          var image = await loadImage(url);
          var frame = await frameFromSource(image, { mirror: false, purpose: "garment", background: "#ffffff" });
          blob = frame.blob;
        } finally { URL.revokeObjectURL(url); }
      }
      if (state.tryon.customUrl) URL.revokeObjectURL(state.tryon.customUrl);
      state.tryon.customBlob = blob;
      state.tryon.customName = file.name || "garment";
      state.tryon.customUrl = URL.createObjectURL(blob);
      state.tryon.category = state.tryon.category || "auto";
      paintTryOn();
    } catch (err) {
      state.tryon.error = err.message || "That garment could not be read.";
      paintTryOn();
    }
  }

  function tryonSource() {
    if (state.tryon.useSkin && state.photo) {
      return Object.assign({}, state.photo, { warnings: buildWarnings(state.photo, "tryon") });
    }
    return state.tryonPhoto;
  }

  async function runTryOn() {
    if (!currentKey()) { openKey(); return; }
    var source = tryonSource();
    if (!source) {
      state.tryon.error = "A try-on needs a photograph with your shoulders in frame.";
      paintTryOn();
      return;
    }
    state.tryon.busy = true;
    state.tryon.error = null;
    state.tryon.status = "Starting apparel try-on.";
    paintTryOn();
    var controller = new AbortController();
    state.cleanup = function () { controller.abort(); };
    try {
      var look = LOOKS.find(function (item) { return item.id === state.tryon.lookId; }) || LOOKS[0];
      var request = {
        srcBlob: source.blob,
        category: state.tryon.customBlob ? (document.getElementById("garmentCategory") || {}).value || state.tryon.category : look.category,
        changeShoes: state.tryon.changeShoes,
        signal: controller.signal,
        onProgress: function (event) {
          if (event.taskId) {
            state.pendingCloth = { id: event.taskId, kind: "cloth", startedAt: Date.now() };
            sessionSet("honestMirror.pendingCloth", state.pendingCloth);
          }
          state.tryon.status = phaseText(event);
          var status = document.getElementById("tryon-status");
          if (status) status.textContent = state.tryon.status;
        },
      };
      if (state.tryon.customBlob) request.refBlob = state.tryon.customBlob;
      else request.refUrl = look.url;
      var result = await client().tryOn(request);
      state.pendingCloth = null;
      sessionSet("honestMirror.pendingCloth", null);
      state.tryon.taskId = result.taskId;
      state.tryon.resultUrl = result.imageUrl;
      state.tryon.status = result.imageUrl ? "Try-on finished. Task " + result.taskId + "." : "The task finished without an image URL.";
      if (!result.imageUrl) state.tryon.error = "The apparel task succeeded and did not include an image URL.";
    } catch (err) {
      if (err && err.name === "AbortError") return;
      state.tryon.error = err.message || "Apparel try-on failed.";
      state.tryon.status = "";
    } finally {
      state.tryon.busy = false;
      if (state.cleanup) state.cleanup = null;
      paintTryOn();
    }
  }

  async function resumeCloth() {
    if (!state.pendingCloth) return;
    if (!currentKey()) { openKey(); return; }
    state.tryon.busy = true;
    state.tryon.error = null;
    state.tryon.status = "Resuming the open apparel task.";
    paintTryOn();
    try {
      var result = await client().pollExisting("cloth", state.pendingCloth.id, {
        onProgress: function (event) {
          state.tryon.status = phaseText(event);
          var status = document.getElementById("tryon-status");
          if (status) status.textContent = state.tryon.status;
        },
      });
      state.pendingCloth = null;
      sessionSet("honestMirror.pendingCloth", null);
      state.tryon.resultUrl = result.imageUrl;
      state.tryon.taskId = result.taskId;
      state.tryon.status = "Resumed. Task " + result.taskId + ".";
      if (!result.imageUrl) state.tryon.error = "The task finished without an image URL.";
    } catch (err) {
      state.tryon.error = err.message || "The apparel task could not be resumed.";
    } finally {
      state.tryon.busy = false;
      paintTryOn();
    }
  }

  function openKey() {
    var dialog = document.getElementById("keyDialog");
    var input = document.getElementById("keyInput");
    input.value = "";
    refreshKeyButton();
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function bindChrome() {
    var toggle = document.getElementById("filterToggle");
    var stored = storageGet("honestMirror.showFiltered");
    var on = stored === "" ? true : stored === "1";
    toggle.checked = on;
    document.body.classList.toggle("show-filtered", on);
    toggle.addEventListener("change", function () {
      document.body.classList.toggle("show-filtered", toggle.checked);
      storageSet("honestMirror.showFiltered", toggle.checked ? "1" : "0");
    });
    document.getElementById("keyButton").onclick = openKey;
    document.getElementById("closeKey").onclick = function () {
      document.getElementById("keyDialog").close();
    };
    document.getElementById("revealKey").onchange = function (event) {
      document.getElementById("keyInput").type = event.target.checked ? "text" : "password";
    };
    document.getElementById("saveKey").onclick = function () {
      var value = document.getElementById("keyInput").value.trim();
      if (!value || Honesty.isPlaceholderKey(value)) return;
      storageSet("honestMirror.apiKey", value);
      document.getElementById("keyInput").value = "";
      refreshKeyButton();
      document.getElementById("keyDialog").close();
      if (state.step === "review") render();
    };
    document.getElementById("forgetKey").onclick = function () {
      storageRemove("honestMirror.apiKey");
      refreshKeyButton();
    };
    window.addEventListener("popstate", function (event) {
      if (event.state && event.state.step) {
        state.step = event.state.step;
        render();
      }
    });
  }

  function holdFrame(frame) {
    decorate(frame);
    frame.url = URL.createObjectURL(frame.blob);
    return frame;
  }

  async function init() {
    state.pendingSkin = freshPending(sessionGet("honestMirror.pendingSkin"));
    state.pendingCloth = freshPending(sessionGet("honestMirror.pendingCloth"));
    if (!state.pendingSkin) sessionSet("honestMirror.pendingSkin", null);
    if (!state.pendingCloth) sessionSet("honestMirror.pendingCloth", null);
    var params = new URLSearchParams(window.location.search);
    if (params.get("preview") === "report") {
      state.rehearsal = true;
      state.rawPayload = Honesty.rehearsalEnvelope();
      state.parsed = Honesty.parseAnalysis(state.rawPayload);
      state.decision = Honesty.audit(state.parsed);
      state.taskId = "rehearsal";
      state.engine = "sd";
      state.step = "report";
      state.tryon.useSkin = true;
      document.getElementById("rehearsalBanner").hidden = false;
      try { state.photo = holdFrame(await sampleFrame("skin")); }
      catch (err) { state.error = "The sample photograph could not be loaded."; }
    } else if (params.get("preview") === "check") {
      try {
        state.photo = holdFrame(await sampleFrame("skin"));
        state.engineChoice = "hd";
        state.step = "review";
      } catch (err) {
        state.error = "The sample photograph could not be loaded.";
      }
      var banner = document.getElementById("rehearsalBanner");
      banner.hidden = false;
      banner.textContent = "Sample photograph on the check screen. No request has been sent.";
    }
    bindChrome();
    refreshKeyButton();
    try { history.replaceState({ step: state.step }, "", location.href); }
    catch (err) { /* file:// */ }
    render();
  }

  init();
})();
