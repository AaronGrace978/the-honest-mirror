const test = require("node:test");
const assert = require("node:assert/strict");
const Honesty = require("../js/honesty.js");

function auditOf(envelope) {
  const parsed = Honesty.parseAnalysis(envelope);
  return { parsed: parsed, decision: Honesty.audit(parsed) };
}

test("actions stay in one engine and match the published unit bands", function () {
  const sd = Honesty.actionsFor("sd");
  const hd = Honesty.actionsFor("hd");
  assert.equal(sd.length, 16);
  assert.equal(hd.length, 16);
  assert.ok(sd.every(function (item) { return !item.startsWith("hd_"); }));
  assert.ok(hd.every(function (item) { return item.startsWith("hd_"); }));
  assert.ok(sd.includes("dark_circle_v2"));
  assert.ok(hd.includes("hd_dark_circle"));
  assert.ok(!hd.includes("hd_dark_circle_v2"));
  assert.equal(Honesty.unitCost(16, "sd"), 16);
  assert.equal(Honesty.unitCost(16, "hd"), 22);
  assert.equal(Honesty.unitCost(9, "sd"), 14);
  assert.equal(Honesty.unitCost(8, "hd"), 16);
  assert.equal(Honesty.unitCost(1, "sd"), 9);
  assert.equal(Honesty.unitCost(0, "sd"), 0);
  assert.throws(function () { Honesty.assertUniform(["pore", "hd_pore"]); }, /mixed/);
  assert.equal(Honesty.engineForDimensions(1280, 720), "sd");
  assert.equal(Honesty.engineForDimensions(1920, 1080), "hd");
  assert.equal(Honesty.engineForDimensions(400, 400), "too_small");
  assert.match(Honesty.unitSentence("sd"), /16 units/);
});

test("rehearsal reading offers three receipts and refuses the rest", function () {
  const result = auditOf(Honesty.rehearsalEnvelope());
  const ids = result.decision.offers.map(function (item) { return item.id; });
  assert.deepEqual(ids, ["retinoid", "ointment", "niacinamide"]);
  result.decision.offers.forEach(function (item) {
    const metric = result.parsed.metrics.find(function (entry) { return entry.id === item.receipt.metric; });
    assert.ok(metric, item.id);
    assert.equal(item.receipt.raw, metric.raw);
    assert.ok(item.receipt.raw < item.receipt.line);
    assert.ok(item.receipt.confidenceText);
  });
  assert.equal(result.decision.offers[0].receipt.metric, "wrinkle");
  assert.equal(result.decision.offers[1].receipt.metric, "moisture");
  assert.equal(result.decision.offers[2].receipt.metric, "pore");
  const declined = Object.fromEntries(result.decision.declines.map(function (item) { return [item.id, item]; }));
  assert.match(declined.humectant.reason, /ointment|second moisturizer/i);
  assert.match(declined.lactic.reason, /stack|retinoid/i);
  assert.match(declined.lactic.reason, /54/);
  assert.match(declined.clay.reason, /61\.4|61/);
  assert.match(declined.azelaic.reason, /72/);
  assert.match(declined["vitamin-c"].reason, /80|83/);
  assert.match(declined.caffeine.reason, /\d/);
  assert.equal(result.parsed.skin.label, "Combination");
  assert.equal(result.parsed.skin.zones.t_zone, "Oily");
  assert.equal(result.parsed.skin.zones.u_zone, "Dry");
  assert.equal(Honesty.leadMetric(result.parsed.metrics).id, "wrinkle");
  assert.equal(result.decision.kindness.id, "wrinkle");
  assert.ok(result.decision.kindness.lift > 20);
  const pore = result.parsed.metrics.find(function (metric) { return metric.id === "pore"; });
  assert.equal(pore.raw, 50);
  assert.equal(pore.regions.find(function (region) { return region.id === "nose"; }).raw, 29.1);
  assert.match(result.decision.offers[2].receipt.note, /Nose/);
});

test("a quiet face buys nothing", function () {
  const output = Honesty.METRIC_INFO && [
    "moisture", "oiliness", "acne", "redness", "pore", "texture", "wrinkle",
    "firmness", "radiance", "age_spot", "dark_circle", "eye_bag", "tear_trough",
  ].map(function (id, index) {
    return { type: id, raw_score: 86 + (index % 3), ui_score: 88 };
  });
  const result = auditOf({ results: { output: output, skin_type: { whole: "Normal" } } });
  assert.equal(result.decision.offers.length, 0);
  assert.match(result.decision.ruling, /Nothing cleared the line/);
  assert.ok(result.decision.declines.length >= 8);
});

test("boundaries: 48 is a serum, 47.9 is an ointment, 58 buys nothing", function () {
  function moistureOnly(raw) {
    return auditOf({
      results: {
        output: [
          { type: "moisture", raw_score: raw, ui_score: raw },
          { type: "acne", raw_score: 90, ui_score: 90 },
        ],
      },
    });
  }
  assert.equal(moistureOnly(48).decision.offers[0].id, "humectant");
  assert.equal(moistureOnly(47.9).decision.offers[0].id, "ointment");
  assert.equal(moistureOnly(58).decision.offers.length, 0);
  assert.equal(moistureOnly(57.9).decision.offers[0].id, "humectant");
});

test("a harsh region does not authorize a whole-face product", function () {
  const result = auditOf({
    results: {
      output: [
        { type: "pore", region: "whole", raw_score: 72, ui_score: 75 },
        { type: "pore", region: "nose", raw_score: 29, ui_score: 58 },
        { type: "oiliness", raw_score: 90, ui_score: 88 },
        { type: "moisture", raw_score: 80, ui_score: 80 },
      ],
    },
  });
  assert.equal(result.decision.offers.length, 0);
  const nia = result.decision.declines.find(function (item) { return item.id === "niacinamide"; });
  assert.match(nia.reason, /Nose/);
  assert.match(nia.reason, /29/);
  assert.match(nia.reason, /72/);
});

test("dry classification blocks oil products even when the oil score is low", function () {
  const result = auditOf({
    results: {
      output: [
        { type: "oiliness", raw_score: 30, ui_score: 55 },
        { type: "pore", raw_score: 90, ui_score: 90 },
        { type: "moisture", raw_score: 80, ui_score: 82 },
      ],
      skin_type: { whole: "Dry" },
    },
  });
  assert.equal(result.decision.offers.length, 0);
  const nia = result.decision.declines.find(function (item) { return item.id === "niacinamide"; });
  const clay = result.decision.declines.find(function (item) { return item.id === "clay"; });
  assert.match(nia.reason, /dry/i);
  assert.match(nia.reason, /30/);
  assert.match(clay.reason, /dry/i);
});

test("strong oil on an oily face gets clay, not a second oil product", function () {
  const result = auditOf({
    results: {
      output: [
        { type: "oiliness", raw_score: 35, ui_score: 60 },
        { type: "pore", raw_score: 80, ui_score: 80 },
        { type: "moisture", raw_score: 85, ui_score: 85 },
      ],
      skin_type: { whole: "Oily" },
    },
  });
  assert.deepEqual(result.decision.offers.map(function (item) { return item.id; }), ["clay"]);
  const nia = result.decision.declines.find(function (item) { return item.id === "niacinamide"; });
  assert.match(nia.reason, /second oil|Clay already/i);
});

test("moderate oil prefers the gentler receipt", function () {
  const result = auditOf({
    results: {
      output: [
        { type: "oiliness", raw_score: 45, ui_score: 62 },
        { type: "moisture", raw_score: 85, ui_score: 85 },
      ],
      skin_type: { whole: "Oily" },
    },
  });
  assert.deepEqual(result.decision.offers.map(function (item) { return item.id; }), ["niacinamide"]);
  const clay = result.decision.declines.find(function (item) { return item.id === "clay"; });
  assert.match(clay.reason, /gentler|Niacinamide/i);
});

test("texture alone can justify lactic acid, and redness blocks a retinoid", function () {
  const lactic = auditOf({
    results: {
      output: [
        { type: "texture", raw_score: 54, ui_score: 70 },
        { type: "wrinkle", raw_score: 80, ui_score: 80 },
        { type: "firmness", raw_score: 88, ui_score: 85 },
        { type: "redness", raw_score: 80, ui_score: 80 },
      ],
    },
  });
  assert.deepEqual(lactic.decision.offers.map(function (item) { return item.id; }), ["lactic"]);

  const blocked = auditOf({
    results: {
      output: [
        { type: "wrinkle", raw_score: 40, ui_score: 64 },
        { type: "redness", raw_score: 42, ui_score: 60 },
      ],
    },
  });
  const ids = blocked.decision.offers.map(function (item) { return item.id; });
  assert.ok(ids.includes("azelaic"));
  assert.ok(!ids.includes("retinoid"));
  const retinoid = blocked.decision.declines.find(function (item) { return item.id === "retinoid"; });
  assert.match(retinoid.reason, /42/);
});

test("the shelf stops at three and the cut still cites its metric", function () {
  const result = auditOf({
    results: {
      output: [
        { type: "moisture", raw_score: 40, ui_score: 70 },
        { type: "acne", raw_score: 42, ui_score: 60 },
        { type: "wrinkle", raw_score: 44, ui_score: 60 },
        { type: "radiance", raw_score: 46, ui_score: 60 },
        { type: "pore", raw_score: 48, ui_score: 60 },
        { type: "redness", raw_score: 90, ui_score: 90 },
        { type: "firmness", raw_score: 90, ui_score: 88 },
        { type: "texture", raw_score: 80, ui_score: 80 },
        { type: "oiliness", raw_score: 90, ui_score: 88 },
      ],
      skin_type: { whole: "Normal" },
    },
  });
  assert.deepEqual(result.decision.offers.map(function (item) { return item.id; }), ["ointment", "azelaic", "retinoid"]);
  const cut = result.decision.declines.filter(function (item) { return /weaker case/.test(item.reason); });
  assert.equal(cut.length, 2);
  assert.ok(cut.every(function (item) { return item.metric && item.raw < 58; }));
});

test("parser accepts the poll envelope and the score_info shape", function () {
  const live = Honesty.parseAnalysis({
    status: 200,
    data: {
      task_status: "success",
      results: {
        all: null,
        output: [
          { type: "hd_moisture", raw_score: 61.2, ui_score: 64, mask_urls: ["https://example.com/m.png"] },
          { type: "hd_pore", region: "whole", raw_score: 70, ui_score: 74 },
          { type: "hd_pore", region: "nose", raw_score: 22, ui_score: 40 },
          { type: "hd_skin_type", region: "whole", class: "Oily" },
          { type: "dark_circle_v2", raw_score: 81, ui_score: 79 },
        ],
      },
    },
  });
  const moisture = live.metrics.find(function (metric) { return metric.id === "moisture"; });
  const pore = live.metrics.find(function (metric) { return metric.id === "pore"; });
  const circles = live.metrics.find(function (metric) { return metric.id === "dark_circle"; });
  assert.equal(moisture.raw, 61.2);
  assert.equal(moisture.maskUrl, "https://example.com/m.png");
  assert.equal(pore.raw, 70);
  assert.equal(pore.regions[0].id, "nose");
  assert.equal(circles.raw, 81);
  assert.equal(live.skin.label, "Oily");
  assert.equal(live.apiOverall, null);

  const zip = Honesty.parseAnalysis({
    moisture: { raw_score: 40, ui_score: 70 },
    hd_pore: {
      whole: { raw_score: 50, ui_score: 60 },
      nose: { raw_score: 20, ui_score: 40 },
    },
    all: { score: 75.7 },
    skin_age: 37,
    skin_type: { whole: "Dry", t_zone: "Oily", u_zone: "Dry" },
  });
  assert.equal(zip.metrics.find(function (metric) { return metric.id === "moisture"; }).raw, 40);
  assert.equal(zip.metrics.find(function (metric) { return metric.id === "pore"; }).regions[0].raw, 20);
  assert.equal(zip.apiOverall, 75.7);
  assert.equal(zip.skinAge, 37);
  assert.equal(zip.skin.label, "Dry");
  assert.equal(zip.skin.zones.t_zone, "Oily");
});

test("public copy does not flatter or sell a feeling", function () {
  const banned = [
    /flawless/i,
    /gorgeous/i,
    /stunning/i,
    /\bperfect skin\b/i,
    /\banti-aging\b/i,
    /\bugly\b/i,
    /\bflawed\b/i,
    /glow up/i,
    /you look/i,
  ];
  const blob = Honesty.publicCopy().join("\n");
  const result = auditOf(Honesty.rehearsalEnvelope());
  const spoken = [
    blob,
    result.decision.ruling,
    result.decision.kindness.text,
    result.decision.offers.map(function (item) { return item.receipt.note + item.blurb; }).join("\n"),
    result.decision.declines.map(function (item) { return item.reason; }).join("\n"),
    result.parsed.metrics.map(function (metric) {
      return Honesty.readingSentence(metric) + " " + Honesty.filteredSentence(metric);
    }).join("\n"),
  ].join("\n");
  banned.forEach(function (pattern) {
    assert.doesNotMatch(spoken, pattern);
  });
});

test("a high score is a healthier reading, and a low score is below the line", function () {
  const high = Honesty.readingSentence({ label: "Moisture", raw: 90, ui: 88, regions: [] });
  assert.match(high, /90/);
  assert.match(high, /healthier reading/);
  assert.doesNotMatch(high, /very little/i);
  const low = Honesty.readingSentence({ label: "Wrinkles", raw: 36.1, ui: 60, regions: [] });
  assert.match(low, /Below 58/);
  const mid = Honesty.readingSentence({ label: "Oiliness", raw: 61.4, ui: 72, regions: [] });
  assert.match(mid, /Above 58/);
  assert.doesNotMatch(mid, /short of the line/i);
});

test("placeholder keys are recognized and real-looking keys are kept", function () {
  assert.equal(Honesty.isPlaceholderKey(""), true);
  assert.equal(Honesty.isPlaceholderKey("YOUR_API_KEY"), true);
  assert.equal(Honesty.isPlaceholderKey("paste your key"), true);
  assert.equal(Honesty.isPlaceholderKey("yc-live-7f3aa91c0e"), false);
});
