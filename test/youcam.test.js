const test = require("node:test");
const assert = require("node:assert/strict");
const YouCam = require("../js/youcam.js");

test("errors become plain sentences and keep the service code", function () {
  assert.match(YouCam.humanizeError({ error_code: "InvalidApiKey", error: "nope" }), /refused/);
  assert.match(YouCam.humanizeError({ error: "error_no_face" }), /No face/);
  assert.match(YouCam.humanizeError({ error: "error_apply_region_mismatch" }), /does not show/);
  assert.equal(
    YouCam.humanizeError({ error: "This API key isn't recognized.", error_code: "InvalidApiKey" }).includes("refused"),
    true
  );
  assert.match(YouCam.humanizeError({ error_message: "Face width 42% of frame." }), /42%/);
  assert.match(YouCam.humanizeError({ code: "missing_key" }), /API key/);
});

test("try-on result URL is read from the poll body", function () {
  const url = "https://example.com/result.jpg";
  assert.equal(YouCam.resultImageUrl({ status: 200, data: { task_status: "success", results: { url: url } } }), url);
  assert.equal(YouCam.resultImageUrl({ results: { download_url: url } }), url);
  assert.equal(YouCam.resultImageUrl({ results: { output: [{ url: url }] } }), url);
  assert.equal(YouCam.resultImageUrl({ results: {} }), null);
});
