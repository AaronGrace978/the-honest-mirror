/* Honesty layer for The Honest Mirror.
   Scores come from YouCam. Higher means the model sees a healthier surface.
   raw_score is the model. ui_score is the documented kinder adjustment.
   Products are offered only from raw scores, and every offer names its metric. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Honesty = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LINE = {
    offer: 58,
    ointment: 48,
    firmness: 62,
    textureForRetinoid: 52,
    clay: 50,
    clayStrong: 40,
    clayWhenTypeUnknown: 45,
    moistureOkForClay: 60,
    rednessBlocksRetinoid: 48,
    rednessBlocksAcid: 52,
    tear: 50,
    harshRegion: 50,
  };

  const SD_ACTIONS = [
    "wrinkle",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
    "firmness",
    "acne",
    "moisture",
    "eye_bag",
    "dark_circle_v2",
    "age_spot",
    "radiance",
    "redness",
    "oiliness",
    "pore",
    "texture",
    "tear_trough",
    "skin_type",
  ];

  const HD_ACTIONS = [
    "hd_wrinkle",
    "hd_droopy_upper_eyelid",
    "hd_droopy_lower_eyelid",
    "hd_firmness",
    "hd_acne",
    "hd_moisture",
    "hd_eye_bag",
    "hd_dark_circle",
    "hd_age_spot",
    "hd_radiance",
    "hd_redness",
    "hd_oiliness",
    "hd_pore",
    "hd_texture",
    "hd_tear_trough",
    "hd_skin_type",
  ];

  const METRIC_INFO = {
    moisture: {
      label: "Moisture",
      sees: "How hydrated the surface looks in this light. A lower score means the model sees a drier surface.",
    },
    oiliness: {
      label: "Oiliness",
      sees: "Shine and sebum the model can pick out. A high score means it does not see much oil.",
    },
    acne: {
      label: "Acne",
      sees: "Spots the model marks as acne. A high score means it sees little.",
    },
    redness: {
      label: "Redness",
      sees: "Red the model separates from the rest of the skin tone. A high score means it sees little.",
    },
    pore: {
      label: "Pores",
      sees: "How visible pores are. A high score means they read as less visible.",
    },
    texture: {
      label: "Texture",
      sees: "How even the surface looks up close. A high score means smoother to the model. This page does not smooth anything.",
    },
    wrinkle: {
      label: "Wrinkles",
      sees: "Lines the model marks. A high score means it sees fewer or shallower lines.",
    },
    firmness: {
      label: "Firmness",
      sees: "The model's read on slack versus firm. A high score means it sees a firmer surface.",
    },
    radiance: {
      label: "Radiance",
      sees: "How much light the skin seems to return. A high score means a brighter reading. No filter is applied to the photograph.",
    },
    age_spot: {
      label: "Age spots",
      sees: "Pigment marks the model points at. A high score means it sees fewer of them.",
    },
    dark_circle: {
      label: "Dark circles",
      sees: "Darker tone under the eyes. A high score means it sees less of that shadow.",
    },
    eye_bag: {
      label: "Eye bags",
      sees: "Fullness under the eyes. A high score means it sees less of it.",
    },
    tear_trough: {
      label: "Tear trough",
      sees: "The groove under the eye. A high score means it reads as less pronounced.",
    },
    droopy_upper_eyelid: {
      label: "Upper eyelid",
      sees: "How low the upper lid sits in the photograph. This is anatomy in a picture, not a product category.",
    },
    droopy_lower_eyelid: {
      label: "Lower eyelid",
      sees: "How the lower lid sits in the photograph. This is anatomy in a picture, not a product category.",
    },
  };

  const METRIC_ORDER = [
    "moisture",
    "oiliness",
    "acne",
    "redness",
    "pore",
    "texture",
    "wrinkle",
    "firmness",
    "radiance",
    "age_spot",
    "dark_circle",
    "eye_bag",
    "tear_trough",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
  ];

  const REGION_LABELS = {
    whole: "Whole face",
    forehead: "Forehead",
    nose: "Nose",
    cheek: "Cheek",
    glabellar: "Between the brows",
    crowfeet: "Crow's feet",
    periocular: "Around the eyes",
    nasolabial: "Nasolabial",
    marionette: "Marionette",
    t_zone: "T-zone",
    u_zone: "U-zone",
  };

  const REGION_ORDER = [
    "forehead",
    "glabellar",
    "nose",
    "cheek",
    "periocular",
    "crowfeet",
    "nasolabial",
    "marionette",
    "t_zone",
    "u_zone",
  ];

  const PRODUCTS = [
    {
      id: "ointment",
      order: 1,
      name: "Barrier ointment",
      blurb: "Petrolatum occlusive. It slows water leaving the surface. It does not add water, and it does not blur the photograph.",
    },
    {
      id: "humectant",
      order: 2,
      name: "Plain humectant serum",
      blurb: "Glycerin and hyaluronate. They bind water to the surface. Useful when the moisture score is down, and pointless when it is not.",
    },
    {
      id: "azelaic",
      order: 3,
      name: "Azelaic gel 10%",
      blurb: "For a reading that actually shows redness or acne. If neither score is low, this is a habit purchase.",
    },
    {
      id: "niacinamide",
      order: 4,
      name: "Niacinamide 5%",
      blurb: "A plain niacinamide serum for pores or oil, and only when the rest of the reading does not call the skin dry.",
    },
    {
      id: "clay",
      order: 5,
      name: "Clay mask",
      blurb: "Absorbs oil. Easy to oversell. Refused when the face reads dry, or when oil is not actually high.",
    },
    {
      id: "retinoid",
      order: 6,
      name: "Retinoid, low strength",
      blurb: "A beginner retinoid. The receipt has to be lines, firmness, or a very rough texture score. Paused when redness is already strong.",
    },
    {
      id: "lactic",
      order: 7,
      name: "Gentle lactic acid",
      blurb: "A mild acid for texture. Refused when a retinoid already has a receipt, because stacking the two is how a barrier gets damaged and a third product gets sold.",
    },
    {
      id: "vitamin-c",
      order: 8,
      name: "Vitamin C serum",
      blurb: "For a dull reading or spots the model can see. Not a default morning ritual.",
    },
    {
      id: "caffeine",
      order: 9,
      name: "Caffeine eye gel",
      blurb: "A temporary de-puffer. Only if an under-eye score says so. It does not change skin age.",
    },
  ];

  const SCALE_NOTE =
    "Scores run from 1 to 100. Higher means the model sees a healthier surface. A lower number is not a verdict on you. It is a number about a photograph.";

  const DISCLAIMER =
    "This is not a diagnosis and not a dermatologist. It describes one photograph. Makeup, glasses, light, and camera noise stay in the numbers.";

  const PUBLISHED_SPECIMEN = {
    source: "YouCam published score_info sample",
    metric: "Moisture",
    raw: 48.694559931755066,
    ui: 70,
    firmnessRaw: 89.66898322105408,
    firmnessUi: 85,
    note: "Published sample figure. Not a live reading and not your face.",
  };

  function canonicalId(type) {
    return String(type || "")
      .trim()
      .toLowerCase()
      .replace(/^hd_/, "")
      .replace(/_v2$/, "");
  }

  function canonicalRegion(region) {
    const value = String(region || "whole")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (value === "tzone") return "t_zone";
    if (value === "uzone") return "u_zone";
    return value || "whole";
  }

  function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = parseFloat(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function fmt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function prettyLabel(value) {
    const clean = String(value || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return null;
    if (/[A-Z]/.test(clean)) return clean;
    return clean.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function metricLabel(id) {
    return (METRIC_INFO[id] && METRIC_INFO[id].label) || prettyLabel(id) || id;
  }

  function regionLabel(id) {
    return REGION_LABELS[id] || prettyLabel(id) || id;
  }

  function actionLabel(action) {
    const id = canonicalId(action);
    if (id === "skin_type") return "Skin type";
    return metricLabel(id);
  }

  function actionsFor(engine) {
    return engine === "hd" ? HD_ACTIONS.slice() : SD_ACTIONS.slice();
  }

  function assertUniform(actions) {
    const list = actions || [];
    const hd = list.filter((item) => String(item).startsWith("hd_"));
    if (hd.length && hd.length !== list.length) {
      throw new Error("HD and SD concerns cannot be mixed.");
    }
    return list;
  }

  function unitCost(count, engine) {
    const n = Number(count) || 0;
    if (n <= 0) return 0;
    const table =
      engine === "hd"
        ? [
            [4, 12],
            [8, 16],
            [12, 20],
            [16, 22],
          ]
        : [
            [4, 9],
            [8, 12],
            [12, 14],
            [16, 16],
          ];
    for (const [max, units] of table) {
      if (n <= max) return units;
    }
    return table[table.length - 1][1];
  }

  function unitSentence(engine) {
    const actions = actionsFor(engine);
    const units = unitCost(actions.length, engine);
    const band = engine === "hd" ? "high detail" : "standard detail";
    return (
      actions.length +
      " " +
      band +
      " scores. The published unit table puts that at " +
      units +
      " units, and only if the task succeeds. Your YouCam console is the ledger."
    );
  }

  function engineForDimensions(width, height) {
    const short = Math.min(Number(width) || 0, Number(height) || 0);
    if (short < 480) return "too_small";
    if (short >= 1080) return "hd";
    return "sd";
  }

  function isPlaceholderKey(key) {
    if (key == null) return true;
    const value = String(key).trim();
    if (!value) return true;
    return /your[_\s-]?api[_\s-]?key|paste[_\s-]?your|changeme|placeholder/i.test(value);
  }

  const LABEL_KEYS = [
    "class",
    "ui_class",
    "skin_type",
    "label",
    "category",
    "result",
    "skinType",
    "output_class",
  ];

  function pickLabel(item, depth) {
    if (item == null || (depth || 0) > 3) return null;
    if (typeof item === "string") return prettyLabel(item);
    if (typeof item === "number") return null;
    if (typeof item !== "object") return null;
    for (let i = 0; i < LABEL_KEYS.length; i += 1) {
      const key = LABEL_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      const value = item[key];
      if (typeof value === "number") continue;
      if (typeof value === "string" && value.trim()) return prettyLabel(value);
      if (value && typeof value === "object") {
        const inner = pickLabel(value, (depth || 0) + 1);
        if (inner) return inner;
      }
    }
    return null;
  }

  function scorePair(item) {
    return {
      raw: asNumber(item.raw_score != null ? item.raw_score : item.rawScore),
      ui: asNumber(item.ui_score != null ? item.ui_score : item.uiScore),
    };
  }

  function maskFrom(item) {
    if (!item || typeof item !== "object") return null;
    const list = item.mask_urls || item.maskUrls || (item.mask_url ? [item.mask_url] : []);
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i += 1) {
      if (typeof list[i] === "string" && /^https?:\/\//.test(list[i])) return list[i];
    }
    return null;
  }

  function unwrap(input) {
    if (!input || typeof input !== "object") {
      return { results: {}, output: [], taskStatus: null };
    }
    if (input.data && typeof input.data === "object" && (input.data.results || input.data.task_status)) {
      return unwrap(input.data);
    }
    if (input.results && typeof input.results === "object") {
      const output = Array.isArray(input.results.output) ? input.results.output : [];
      return { results: input.results, output: output, taskStatus: input.task_status || null };
    }
    const output = Array.isArray(input.output) ? input.output : [];
    return { results: input, output: output, taskStatus: input.task_status || null };
  }

  function parseAnalysis(input) {
    const packed = unwrap(input);
    const results = packed.results || {};
    const output = packed.output || [];
    const seen = new Set();
    const readings = [];

    function add(id, region, raw, ui, maskUrl) {
      if (!id || id === "all" || id === "skin_age" || id === "skin_type" || id === "output" || id === "url") {
        return;
      }
      const key = id + "::" + region;
      if (seen.has(key)) return;
      seen.add(key);
      readings.push({ id: id, region: region, raw: raw, ui: ui, maskUrl: maskUrl || null });
    }

    output.forEach(function (item) {
      if (!item || typeof item !== "object") return;
      const id = canonicalId(item.type);
      if (!id || id === "skin_type" || id === "skin_age" || id === "all") return;
      const scores = scorePair(item);
      if (scores.raw == null && scores.ui == null && !item.region) return;
      add(id, canonicalRegion(item.region || "whole"), scores.raw, scores.ui, maskFrom(item));
    });

    Object.keys(results).forEach(function (key) {
      if (key === "output" || key === "url" || key === "all" || key === "skin_age" || key === "skin_type") return;
      const value = results[key];
      const id = canonicalId(key);
      if (!value || typeof value !== "object" || !id) return;
      if ("raw_score" in value || "ui_score" in value || "rawScore" in value || "uiScore" in value) {
        const scores = scorePair(value);
        add(id, "whole", scores.raw, scores.ui, maskFrom(value));
        return;
      }
      Object.keys(value).forEach(function (regionKey) {
        const sub = value[regionKey];
        if (!sub || typeof sub !== "object") return;
        if (!("raw_score" in sub || "ui_score" in sub || "rawScore" in sub || "uiScore" in sub)) return;
        const scores = scorePair(sub);
        add(id, canonicalRegion(regionKey), scores.raw, scores.ui, maskFrom(sub));
      });
    });

    const grouped = new Map();
    readings.forEach(function (row) {
      if (!grouped.has(row.id)) grouped.set(row.id, []);
      grouped.get(row.id).push(row);
    });

    const metrics = [];
    grouped.forEach(function (rows, id) {
      const whole = rows.find(function (row) { return row.region === "whole"; }) || null;
      const regions = rows
        .filter(function (row) { return row.region !== "whole"; })
        .map(function (row) {
          return { id: row.region, label: regionLabel(row.region), raw: row.raw, ui: row.ui };
        })
        .sort(function (a, b) {
          const ia = REGION_ORDER.indexOf(a.id);
          const ib = REGION_ORDER.indexOf(b.id);
          if (ia === -1 && ib === -1) return a.id.localeCompare(b.id);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
      const info = METRIC_INFO[id];
      metrics.push({
        id: id,
        label: metricLabel(id),
        sees: info ? info.sees : "A score the model returned. Higher means a healthier reading.",
        raw: whole ? whole.raw : null,
        ui: whole ? whole.ui : null,
        gap: whole && whole.raw != null && whole.ui != null ? whole.ui - whole.raw : null,
        regions: regions,
        maskUrl: (whole && whole.maskUrl) || (rows.find(function (row) { return row.maskUrl; }) || {}).maskUrl || null,
      });
    });

    metrics.sort(function (a, b) {
      const ia = METRIC_ORDER.indexOf(a.id);
      const ib = METRIC_ORDER.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.id.localeCompare(b.id);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const skin = readSkin(results, output);
    const scored = metrics.filter(function (metric) { return metric.raw != null; });
    return {
      metrics: metrics,
      skin: skin,
      skinAge: readSkinAge(results, output),
      apiOverall: readOverall(results, output),
      rawMean: mean(scored.map(function (metric) { return metric.raw; })),
      uiMean: mean(scored.map(function (metric) { return metric.ui; })),
      taskStatus: packed.taskStatus,
    };
  }

  function readSkin(results, output) {
    const zones = {};
    output.forEach(function (item) {
      if (!item || canonicalId(item.type) !== "skin_type") return;
      const label = pickLabel(item);
      if (!label) return;
      zones[canonicalRegion(item.region || "whole")] = label;
    });
    const block = results.skin_type;
    if (typeof block === "string") {
      if (!zones.whole) zones.whole = prettyLabel(block);
    } else if (block && typeof block === "object") {
      Object.keys(block).forEach(function (key) {
        const region = canonicalRegion(key);
        if (zones[region]) return;
        const value = block[key];
        const label = typeof value === "string" ? prettyLabel(value) : pickLabel(value);
        if (label) zones[region] = label;
      });
    }
    const label = zones.whole || null;
    const text = (label || "").toLowerCase();
    return {
      label: label,
      zones: zones,
      dry: text.includes("dry"),
      oily: text.includes("oily"),
      combo: text.includes("combination"),
      redness: text.includes("redness"),
      normal: /\bnormal\b/.test(text),
      unknown: !label,
    };
  }

  function readSkinAge(results, output) {
    if (typeof results.skin_age === "number") return results.skin_age;
    if (results.skin_age && typeof results.skin_age === "object") {
      const nested = asNumber(results.skin_age.score != null ? results.skin_age.score : results.skin_age.raw_score);
      if (nested != null) return nested;
    }
    const item = output.find(function (entry) { return entry && canonicalId(entry.type) === "skin_age"; });
    if (!item) return null;
    return asNumber(item.score != null ? item.score : item.raw_score != null ? item.raw_score : item.age);
  }

  function readOverall(results, output) {
    if (typeof results.all === "number") return results.all;
    if (results.all && typeof results.all === "object") {
      const nested = asNumber(results.all.score != null ? results.all.score : results.all.raw_score);
      if (nested != null) return nested;
    }
    const item = output.find(function (entry) { return entry && canonicalId(entry.type) === "all"; });
    if (!item) return null;
    return asNumber(item.score != null ? item.score : item.raw_score);
  }

  function mean(values) {
    const nums = values.filter(function (value) { return value != null; });
    if (!nums.length) return null;
    return nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length;
  }

  function byId(metrics) {
    const map = {};
    metrics.forEach(function (metric) { map[metric.id] = metric; });
    return map;
  }

  function confidenceFor(metric) {
    if (!metric || metric.raw == null || metric.ui == null) return "medium";
    const gap = Math.abs(metric.ui - metric.raw);
    if (gap > 15) return "low";
    if (gap > 8) return "medium";
    return "high";
  }

  function minConfidence(a, b) {
    const rank = { low: 1, medium: 2, high: 3 };
    return rank[a] <= rank[b] ? a : b;
  }

  function confidenceSentence(level, metric) {
    if (level === "high") return "Confidence high. The raw score and the filtered score nearly agree.";
    if (level === "medium") return "Confidence medium. The filtered score has moved. Shop from the raw number.";
    if (metric && metric.ui != null && metric.raw != null && Math.abs(metric.ui - metric.raw) > 15) {
      return "Confidence low. The filtered score and the raw score disagree by " + fmt(Math.abs(metric.ui - metric.raw)) + " points. The receipt still uses the raw score.";
    }
    return "Confidence low. A fact this rule needs was missing, so the claim stays narrow. The receipt still uses the raw score.";
  }

  function readingSentence(metric) {
    const name = metric.label;
    if (metric.raw == null) {
      if (metric.regions && metric.regions.length) {
        return name + " came back only as regional scores. There is no whole-face number to shop from.";
      }
      return name + " did not come back as a score.";
    }
    const raw = fmt(metric.raw);
    const head = name + " raw " + raw + ".";
    if (metric.raw >= 85) return head + " High on this scale: a healthier reading. Not a shopping signal.";
    if (metric.raw >= 70) return head + " Above the line. Ordinary, and not a reason to buy.";
    if (metric.raw >= LINE.offer) {
      return head + " Above " + LINE.offer + ", so this mirror will not recommend from it. Still visible in the photograph.";
    }
    return head + " Below " + LINE.offer + ", the line this mirror uses before it will recommend anything.";
  }

  function filteredSentence(metric) {
    if (metric.ui == null || metric.raw == null) return "";
    const gap = metric.ui - metric.raw;
    if (Math.abs(gap) < 0.05) return "A filtered camera would claim " + fmt(metric.ui) + ", the same number.";
    if (gap > 0) {
      return "A filtered camera would claim " + fmt(metric.ui) + ", " + fmt(gap) + " points kinder than the raw score.";
    }
    return "A filtered camera would claim " + fmt(metric.ui) + ", which is " + fmt(Math.abs(gap)) + " lower. The adjustment is not a second measurement.";
  }

  function harshRegion(metric) {
    if (!metric || !metric.regions) return null;
    const harsh = metric.regions.filter(function (region) {
      return region.raw != null && region.raw < LINE.harshRegion;
    });
    harsh.sort(function (a, b) { return a.raw - b.raw; });
    return harsh[0] || null;
  }

  function regionClause(metric) {
    const harsh = harshRegion(metric);
    if (!harsh) return "";
    if (metric.raw == null) {
      return " Only a regional score came back: " + harsh.label + " " + fmt(harsh.raw) + ". That is not a whole-face receipt.";
    }
    if (metric.raw >= LINE.offer) {
      return " " + harsh.label + " is harsher (" + fmt(harsh.raw) + ") than the whole face (" + fmt(metric.raw) + "). A product for the whole face is not justified by one region.";
    }
    return " " + harsh.label + " reads harsher still (" + fmt(harsh.raw) + "). The receipt cites the whole face.";
  }

  function missing(name) {
    return name + " was not in this reading, so nothing can cite it.";
  }

  function worstPassing(pairs) {
    const ok = pairs.filter(function (pair) {
      return pair.metric && pair.metric.raw != null && pair.metric.raw < pair.line;
    });
    ok.sort(function (a, b) { return a.metric.raw - b.metric.raw; });
    return ok[0] || null;
  }

  function lowestRaw(metrics) {
    const present = metrics.filter(function (metric) { return metric && metric.raw != null; });
    present.sort(function (a, b) { return a.raw - b.raw; });
    return present[0] || null;
  }

  function decline(product, metric, reason) {
    return {
      offer: false,
      id: product.id,
      order: product.order,
      name: product.name,
      blurb: product.blurb,
      metric: metric ? metric.id : null,
      raw: metric ? metric.raw : null,
      ui: metric ? metric.ui : null,
      reason: reason,
    };
  }

  function offer(product, metric, line, extra) {
    const note = extra && extra.note ? extra.note : "";
    let level = confidenceFor(metric);
    if (extra && extra.confidence) level = minConfidence(level, extra.confidence);
    return {
      offer: true,
      id: product.id,
      order: product.order,
      name: product.name,
      blurb: product.blurb,
      receipt: {
        metric: metric.id,
        label: metric.label,
        raw: metric.raw,
        ui: metric.ui,
        line: line,
        confidence: level,
        confidenceText: confidenceSentence(level, metric),
        note: note,
      },
    };
  }

  function productById(id) {
    return PRODUCTS.find(function (product) { return product.id === id; });
  }

  function audit(parsed) {
    const metrics = (parsed && parsed.metrics) || [];
    const skin = (parsed && parsed.skin) || { unknown: true, zones: {}, label: null, dry: false, oily: false, combo: false };
    const get = byId(metrics);
    const moisture = get.moisture || null;
    const oil = get.oiliness || null;
    const pore = get.pore || null;
    const acne = get.acne || null;
    const redness = get.redness || null;
    const wrinkle = get.wrinkle || null;
    const firmness = get.firmness || null;
    const texture = get.texture || null;
    const radiance = get.radiance || null;
    const spots = get.age_spot || null;
    const circles = get.dark_circle || null;
    const bags = get.eye_bag || null;
    const trough = get.tear_trough || null;

    const decisions = [];

    const ointmentOk = moisture && moisture.raw != null && moisture.raw < LINE.ointment;
    if (!moisture || moisture.raw == null) {
      decisions.push(decline(productById("ointment"), moisture, missing("Moisture")));
    } else if (ointmentOk) {
      decisions.push(offer(productById("ointment"), moisture, LINE.ointment, {
        note: regionClause(moisture).trim(),
      }));
    } else {
      decisions.push(decline(
        productById("ointment"),
        moisture,
        "Moisture raw " + fmt(moisture.raw) + ". The line for an occlusive is below " + LINE.ointment + "."
      ));
    }

    if (!moisture || moisture.raw == null) {
      decisions.push(decline(productById("humectant"), moisture, missing("Moisture")));
    } else if (ointmentOk) {
      decisions.push(decline(
        productById("humectant"),
        moisture,
        "Moisture raw " + fmt(moisture.raw) + " already supports the ointment. A second moisturizer would be a routine, not a finding."
      ));
    } else if (moisture.raw < LINE.offer) {
      decisions.push(offer(productById("humectant"), moisture, LINE.offer, {
        note: regionClause(moisture).trim(),
      }));
    } else {
      decisions.push(decline(
        productById("humectant"),
        moisture,
        "Moisture raw " + fmt(moisture.raw) + ". The line for a humectant is below " + LINE.offer + "."
      ));
    }

    const azelaicHit = worstPassing([
      { metric: acne, line: LINE.offer },
      { metric: redness, line: LINE.offer },
    ]);
    if (azelaicHit) {
      const other = azelaicHit.metric === acne ? redness : acne;
      let note = "";
      if (other && other.raw != null && other.raw < LINE.offer) {
        note = other.label + " is also under the line (" + fmt(other.raw) + "). One product, one receipt: " + azelaicHit.metric.label.toLowerCase() + ".";
      }
      decisions.push(offer(productById("azelaic"), azelaicHit.metric, azelaicHit.line, { note: note }));
    } else {
      const cited = lowestRaw([acne, redness]);
      decisions.push(decline(
        productById("azelaic"),
        cited,
        cited
          ? cited.label + " raw " + fmt(cited.raw) + ". Neither acne nor redness is under " + LINE.offer + "."
          : "Acne and redness were not both available, and neither cleared a receipt."
      ));
    }

    const retinoidBlocked = redness && redness.raw != null && redness.raw < LINE.rednessBlocksRetinoid;
    const retinoidHit = worstPassing([
      { metric: wrinkle, line: LINE.offer },
      { metric: firmness, line: LINE.firmness },
      { metric: texture, line: LINE.textureForRetinoid },
    ]);
    let retinoidOffered = false;
    if (retinoidBlocked && retinoidHit) {
      decisions.push(decline(
        productById("retinoid"),
        redness,
        "Redness raw " + fmt(redness.raw) + ". A retinoid on top of that reading is how a routine gets worse. " +
          retinoidHit.metric.label + " raw " + fmt(retinoidHit.metric.raw) + " would have been the receipt."
      ));
    } else if (retinoidHit) {
      retinoidOffered = true;
      let note = "";
      if (firmness && retinoidHit.metric !== firmness && firmness.raw != null && firmness.raw >= 75) {
        note = "Firmness raw " + fmt(firmness.raw) + ", so this is not an elasticity sale.";
      }
      if (redness && redness.raw != null && redness.raw < LINE.offer) {
        note = (note ? note + " " : "") + "Redness is also " + fmt(redness.raw) + ". The strength stays low for that reason.";
      }
      decisions.push(offer(productById("retinoid"), retinoidHit.metric, retinoidHit.line, { note: note }));
    } else {
      const cited = lowestRaw([wrinkle, firmness, texture]);
      decisions.push(decline(
        productById("retinoid"),
        cited,
        cited
          ? cited.label + " raw " + fmt(cited.raw) + ". Lines, firmness, and texture do not clear a retinoid."
          : missing("Wrinkles")
      ));
    }

    const lacticOk = texture && texture.raw != null && texture.raw < LINE.offer;
    const acidBlocked = redness && redness.raw != null && redness.raw < LINE.rednessBlocksAcid;
    if (!texture || texture.raw == null) {
      decisions.push(decline(productById("lactic"), texture, missing("Texture")));
    } else if (retinoidOffered && lacticOk) {
      decisions.push(decline(
        productById("lactic"),
        texture,
        "Texture raw " + fmt(texture.raw) + " would have cleared a mild acid. A retinoid already has the receipt, and stacking them is a second sale."
      ));
    } else if (acidBlocked && lacticOk) {
      decisions.push(decline(
        productById("lactic"),
        redness,
        "Texture raw " + fmt(texture.raw) + ", but redness is " + fmt(redness.raw) + ". An acid on top of that is refused."
      ));
    } else if (lacticOk) {
      decisions.push(offer(productById("lactic"), texture, LINE.offer, { note: regionClause(texture).trim() }));
    } else {
      decisions.push(decline(
        productById("lactic"),
        texture,
        "Texture raw " + fmt(texture.raw) + ". The line for a mild acid is below " + LINE.offer + "."
      ));
    }

    const niaCandidates = [];
    if (pore && pore.raw != null && pore.raw < LINE.offer) niaCandidates.push(pore);
    if (oil && oil.raw != null && oil.raw < LINE.offer) niaCandidates.push(oil);
    niaCandidates.sort(function (a, b) { return a.raw - b.raw; });
    const niaChosen = niaCandidates[0] || null;
    const oilConflictsDry = niaChosen && niaChosen.id === "oiliness" && skin.dry;
    const dehydrated = skin.dry && moisture && moisture.raw != null && moisture.raw < LINE.moistureOkForClay;
    let niaOk = !!niaChosen && !oilConflictsDry && !dehydrated;

    const clayBase = oil && oil.raw != null && oil.raw < LINE.clay && !skin.dry &&
      !(moisture && moisture.raw != null && moisture.raw < LINE.moistureOkForClay);
    const clayTypeOk = skin.oily || skin.combo || (skin.unknown && oil && oil.raw != null && oil.raw < LINE.clayWhenTypeUnknown);
    const clayOk = !!(clayBase && clayTypeOk && !skin.normal);

    if (clayOk && oil.raw < LINE.clayStrong) {
      decisions.push(offer(productById("clay"), oil, LINE.clay, {
        confidence: skin.unknown ? "low" : null,
        note: skin.unknown ? "Skin type did not come back. The oil score is strong enough that the mask still has a receipt." : "",
      }));
      if (niaOk) {
        decisions.push(decline(
          productById("niacinamide"),
          niaChosen,
          niaChosen.label + " raw " + fmt(niaChosen.raw) + " would also have cleared. Clay already holds the oil receipt. A second oil product is a routine, not a finding."
        ));
      } else {
        decisions.push(niaDecline(get, skin, moisture, niaChosen, oilConflictsDry, dehydrated));
      }
    } else if (niaOk) {
      const noteParts = [];
      if (niaChosen.id === "pore" && oil && oil.raw != null && oil.raw >= LINE.offer) {
        noteParts.push("Oiliness raw " + fmt(oil.raw) + ", so this is not an oil-control sale.");
      }
      if (skin.dry) noteParts.push("The classification reads dry. Confidence stays guarded.");
      noteParts.push(regionClause(niaChosen).trim());
      decisions.push(offer(productById("niacinamide"), niaChosen, LINE.offer, {
        confidence: skin.dry || skin.unknown ? "medium" : null,
        note: noteParts.filter(Boolean).join(" "),
      }));
      if (clayBase && (skin.oily || skin.combo || skin.unknown)) {
        decisions.push(decline(
          productById("clay"),
          oil,
          "Oiliness raw " + fmt(oil.raw) + " is low enough for a drying mask. Niacinamide already has the receipt, and it is the gentler one."
        ));
      } else {
        decisions.push(clayDecline(oil, moisture, skin));
      }
    } else {
      decisions.push(niaDecline(get, skin, moisture, niaChosen, oilConflictsDry, dehydrated));
      decisions.push(clayDecline(oil, moisture, skin));
    }

    const vitaminHit = worstPassing([
      { metric: radiance, line: LINE.offer },
      { metric: spots, line: LINE.offer },
    ]);
    if (vitaminHit) {
      const other = vitaminHit.metric === radiance ? spots : radiance;
      let note = "";
      if (other && other.raw != null && other.raw < LINE.offer) {
        note = other.label + " is also under the line (" + fmt(other.raw) + "). The receipt cites " + vitaminHit.metric.label.toLowerCase() + ".";
      }
      decisions.push(offer(productById("vitamin-c"), vitaminHit.metric, vitaminHit.line, { note: note }));
    } else {
      const cited = lowestRaw([radiance, spots]);
      decisions.push(decline(
        productById("vitamin-c"),
        cited,
        cited
          ? cited.label + " raw " + fmt(cited.raw) + ". Radiance and spots are both too high for a vitamin C receipt."
          : "Radiance and spots were not in this reading."
      ));
    }

    const eyeHit = worstPassing([
      { metric: circles, line: LINE.offer },
      { metric: bags, line: LINE.offer },
      { metric: trough, line: LINE.tear },
    ]);
    if (eyeHit) {
      decisions.push(offer(productById("caffeine"), eyeHit.metric, eyeHit.line, { note: "" }));
    } else {
      const cited = lowestRaw([circles, bags, trough]);
      decisions.push(decline(
        productById("caffeine"),
        cited,
        cited
          ? cited.label + " raw " + fmt(cited.raw) + ". Under-eye scores do not clear an eye gel."
          : "Under-eye scores were not in this reading."
      ));
    }

    let offers = decisions.filter(function (item) { return item.offer; });
    const declines = decisions.filter(function (item) { return !item.offer; });
    offers.sort(function (a, b) {
      return a.receipt.raw - b.receipt.raw || a.order - b.order;
    });
    const cut = offers.slice(3);
    offers = offers.slice(0, 3);
    cut.forEach(function (item) {
      declines.push(decline(
        item,
        { id: item.receipt.metric, raw: item.receipt.raw, ui: item.receipt.ui },
        "It cleared the line on " + item.receipt.label.toLowerCase() + " raw " + fmt(item.receipt.raw) + ". The ruling stops at three products, and this was the weaker case."
      ));
    });
    declines.sort(function (a, b) { return a.order - b.order; });

    return {
      offers: offers,
      declines: declines,
      ruling: ruling(offers, declines, metrics),
      kindness: kindness(metrics),
    };
  }

  function niaDecline(get, skin, moisture, chosen, oilConflictsDry, dehydrated) {
    const pore = get.pore || null;
    const oil = get.oiliness || null;
    if (oilConflictsDry && chosen) {
      return decline(
        productById("niacinamide"),
        chosen,
        "Oiliness raw " + fmt(chosen.raw) + ", but the classification says dry. Those disagree, so there is no oil-control receipt."
      );
    }
    if (dehydrated && chosen) {
      return decline(
        productById("niacinamide"),
        moisture,
        "Moisture raw " + fmt(moisture.raw) + " and the classification reads dry. " + chosen.label + " raw " + fmt(chosen.raw) + " is not a clean receipt on that face."
      );
    }
    const cited = lowestRaw([pore, oil]);
    let reason;
    if (!cited) {
      reason = "Pores and oil were not in this reading.";
    } else if (cited.raw == null) {
      reason = cited.label + " has no whole-face score." + regionClause(cited);
    } else {
      reason = cited.label + " raw " + fmt(cited.raw) + ". The line is below " + LINE.offer + "." + regionClause(cited);
    }
    return decline(productById("niacinamide"), cited, reason);
  }

  function clayDecline(oil, moisture, skin) {
    if (!oil || oil.raw == null) {
      return decline(productById("clay"), oil, missing("Oiliness"));
    }
    if (!(oil.raw < LINE.clay)) {
      return decline(
        productById("clay"),
        oil,
        "Oiliness raw " + fmt(oil.raw) + ". The line for clay is below " + LINE.clay + "."
      );
    }
    if (skin.dry) {
      return decline(
        productById("clay"),
        oil,
        "Oiliness raw " + fmt(oil.raw) + ", but the classification says dry. Clay on a dry reading is refused."
      );
    }
    if (moisture && moisture.raw != null && moisture.raw < LINE.moistureOkForClay) {
      return decline(
        productById("clay"),
        moisture,
        "Oiliness raw " + fmt(oil.raw) + ", but moisture is " + fmt(moisture.raw) + ". Clay on a dry surface is an upsell."
      );
    }
    if (skin.normal) {
      return decline(
        productById("clay"),
        oil,
        "Oiliness raw " + fmt(oil.raw) + ", and the classification says normal. That is not a clay receipt."
      );
    }
    if (skin.unknown && !(oil.raw < LINE.clayWhenTypeUnknown)) {
      return decline(
        productById("clay"),
        oil,
        "Oiliness raw " + fmt(oil.raw) + " is under " + LINE.clay + ", but skin type did not come back. That is too thin a receipt for a drying mask."
      );
    }
    return decline(
      productById("clay"),
      oil,
      "Oiliness raw " + fmt(oil.raw) + ". The classification (" + (skin.label || "missing") + ") does not support clay."
    );
  }

  function ruling(offers, declines, metrics) {
    if (!metrics.length) return "The service returned no scores. There is nothing to recommend, and nothing to refuse.";
    if (!offers.length) {
      const worst = metrics.filter(function (metric) { return metric.raw != null; })
        .sort(function (a, b) { return a.raw - b.raw; })[0];
      if (!worst) return "No whole-face scores came back. Nothing is recommended.";
      return "Nothing cleared the line. The lowest raw score is " + worst.label.toLowerCase() + " at " + fmt(worst.raw) + ". That is not a purchase.";
    }
    const offerWord = offers.length === 1 ? "product is" : "products are";
    const declineWord = declines.length === 1 ? "was" : "were";
    return offers.length + " " + offerWord + " supported. " + declines.length + " " + declineWord + " refused. Each one that remains has a receipt.";
  }

  function kindness(metrics) {
    let best = null;
    metrics.forEach(function (metric) {
      if (metric.raw == null || metric.ui == null) return;
      const lift = metric.ui - metric.raw;
      if (!best || lift > best.lift) {
        best = { id: metric.id, label: metric.label, raw: metric.raw, ui: metric.ui, lift: lift };
      }
    });
    if (!best) return null;
    if (best.lift > 0.05) {
      best.text = best.label + " is where a filtered camera is kindest: raw " + fmt(best.raw) + ", claim " + fmt(best.ui) + ", a lift of " + fmt(best.lift) + ".";
    } else if (best.lift < -0.05) {
      best.text = "On this reading the filtered scores were not kinder. The largest move was " + best.label.toLowerCase() + ", claim " + fmt(best.ui) + " against raw " + fmt(best.raw) + ".";
    } else {
      best.text = "The filtered scores barely moved. The kindness layer had little to do on this photograph.";
    }
    return best;
  }

  function leadMetric(metrics) {
    const scored = (metrics || []).filter(function (metric) { return metric.raw != null; });
    scored.sort(function (a, b) { return a.raw - b.raw; });
    return scored[0] || (metrics && metrics[0]) || null;
  }

  function rehearsalEnvelope() {
    return {
      data: {
        task_status: "success",
        task_id: "rehearsal",
        results: {
          all: null,
          skin_age: null,
          output: [
            { type: "moisture", raw_score: 46.2, ui_score: 70 },
            { type: "wrinkle", raw_score: 36.1, ui_score: 60 },
            { type: "oiliness", raw_score: 61.4, ui_score: 72 },
            { type: "acne", raw_score: 92.3, ui_score: 88 },
            { type: "redness", raw_score: 72, ui_score: 77 },
            { type: "pore", region: "whole", raw_score: 50, ui_score: 67 },
            { type: "pore", region: "forehead", raw_score: 79.6, ui_score: 80 },
            { type: "pore", region: "nose", raw_score: 29.1, ui_score: 58 },
            { type: "pore", region: "cheek", raw_score: 44.1, ui_score: 65 },
            { type: "texture", raw_score: 54, ui_score: 75 },
            { type: "firmness", raw_score: 89.7, ui_score: 85 },
            { type: "radiance", raw_score: 80, ui_score: 79 },
            { type: "age_spot", raw_score: 83.2, ui_score: 77 },
            { type: "dark_circle", raw_score: 80.2, ui_score: 76 },
            { type: "eye_bag", raw_score: 76.7, ui_score: 79 },
            { type: "tear_trough", raw_score: 76, ui_score: 78 },
            { type: "droopy_upper_eyelid", raw_score: 79.1, ui_score: 80 },
            { type: "droopy_lower_eyelid", raw_score: 80, ui_score: 81 },
            { type: "skin_type", region: "whole", class: "Combination" },
            { type: "skin_type", region: "t_zone", class: "Oily" },
            { type: "skin_type", region: "u_zone", class: "Dry" },
          ],
        },
      },
    };
  }

  function publicCopy() {
    const lines = [SCALE_NOTE, DISCLAIMER, PUBLISHED_SPECIMEN.note];
    Object.keys(METRIC_INFO).forEach(function (id) {
      lines.push(METRIC_INFO[id].label, METRIC_INFO[id].sees);
    });
    PRODUCTS.forEach(function (product) {
      lines.push(product.name, product.blurb);
    });
    return lines;
  }

  return {
    LINE: LINE,
    PRODUCTS: PRODUCTS,
    METRIC_INFO: METRIC_INFO,
    SD_ACTIONS: SD_ACTIONS,
    HD_ACTIONS: HD_ACTIONS,
    SCALE_NOTE: SCALE_NOTE,
    DISCLAIMER: DISCLAIMER,
    PUBLISHED_SPECIMEN: PUBLISHED_SPECIMEN,
    canonicalId: canonicalId,
    fmt: fmt,
    actionsFor: actionsFor,
    assertUniform: assertUniform,
    unitCost: unitCost,
    unitSentence: unitSentence,
    engineForDimensions: engineForDimensions,
    isPlaceholderKey: isPlaceholderKey,
    actionLabel: actionLabel,
    parseAnalysis: parseAnalysis,
    audit: audit,
    readingSentence: readingSentence,
    filteredSentence: filteredSentence,
    leadMetric: leadMetric,
    rehearsalEnvelope: rehearsalEnvelope,
    confidenceSentence: confidenceSentence,
    publicCopy: publicCopy,
    regionLabel: regionLabel,
  };
});
