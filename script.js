// ==================== グローバル変数 ====================
let map;
let rows = [];
let taxonMap = {};
let prefectureOrder = [];
let islandOrder = [];
let markers = [];
let literatureArray = [];
let clusterGroup;
let prefectureMeta = []; // [{ jp: "北海道", en: "Hokkaidō" }, ...]
let islandMeta = [];     // [{ jp: "本州", en: "Honshū Island" }, ...]
let publicationYearMinValue = Number.POSITIVE_INFINITY;
let publicationYearMaxValue = Number.NEGATIVE_INFINITY;
let collectionYearMinValue = Number.POSITIVE_INFINITY;
let collectionYearMaxValue = Number.NEGATIVE_INFINITY;
let publicationTimerId = null;
let collectionTimerId = null;
const DEBOUNCE_DELAY = 500; // ms、操作停止から0.5秒後にフィルタ実行

// ポップアップ関連
let currentPopupIndex = 0;
let nearbyRecords = [];
let activePopup = null;
let filteredRows = []; // フィルタリングされたデータ
let currentAnchor = null;
let currentShowAbove = null;
let isZooming = false;

// グラフ関連
let monthChart = null;      // ECharts instance
let prefectureChart = null; // ECharts instance
let yearChart = null;       // ECharts instance
let currentClassification = "order";  // "order" or "family"
let currentChartMode = "count";       // "count" or "ratio"
let chartTitle;

// 翻訳
let lang = localStorage.getItem("preferredLanguage") || "ja";

// ==================== 地図の初期設定 ====================
const initMap = () => {
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const defaultZoom = window.innerWidth <= 711 ? 3 : 4;

  map = new maplibregl.Map({
    container: 'mapid',
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        japan: {
          type: "geojson",
          data: "Japan.geojson",
          attribution: translations[lang]?.map_attribution 
                       || "「<a href='https://nlftp.mlit.go.jp/ksj/' target='_blank'>位置参照情報ダウンロードサービス</a>」（国土交通省）を加工して作成"
        }
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "rgba(173, 216, 230, 1)" } },
        { id: "japan", type: "fill", source: "japan", paint: { "fill-color": "#fff", "fill-outline-color": "#000" } },
        { id: "japan-outline", type: "line", source: "japan", paint: { "line-color": "#000", "line-width": 1 } }
      ]
    },
    center: [136, 35.7],
    zoom: defaultZoom,
    maxZoom: 9,
    minZoom: 3,
    dragPan: !isTouchDevice,
    touchZoomRotate: true
  });

  // 地図コントロール
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');

  // ▼ タッチデバイスの場合のみ、2本指操作でドラッグを許可し、1本指でオーバーレイを表示
  if (isTouchDevice) {
    const touchHint = document.getElementById("touch-hint");
    map.on('touchstart', (e) => {
      if (!e.points) return;
    
      // 2本指以上の場合はピンチズームなどドラッグ許可
      if (e.points.length >= 2) {
        map.dragPan.enable();
        touchHint.style.display = 'none';
        return;
      }
    
      // 1本指の場合 → ドラッグ無効化・移動距離判定の準備
      map.dragPan.disable();
      touchHint.style.display = 'none';
    
      // タッチ開始座標を記録 (1本指だけを想定)
      const p = e.points[0];
      map._touchStartPosition = { x: p.x, y: p.y };
    });
    
    map.on('touchmove', (e) => {
      if (!e.points) return;
    
      if (e.points.length >= 2) {
        // 2本指になった → ドラッグ許可
        map.dragPan.enable();
        touchHint.style.display = 'none';
        return;
      }
    
      // 1本指移動量を判定
      const { x: startX, y: startY } = map._touchStartPosition || {x: 0, y: 0};
      const { x: nowX, y: nowY } = e.points[0];
      const dx = nowX - startX;
      const dy = nowY - startY;
      const dist = Math.sqrt(dx*dx + dy*dy);
    
      // ある程度(例: 10px以上)移動したらオーバーレイを表示
      if (dist > 10) {
        touchHint.style.display = 'block';
      }
    });
    
    map.on('touchend', () => {
      // 1本指を離したらドラッグを無効にしてオーバーレイ非表示
      map.dragPan.disable();
      touchHint.style.display = 'none';
    });
  }

  // 既存の呼び出し（選択ラベル更新など）
  updateSelectedLabels();

};

function initBiennialSelects() {
  const targetSelect = document.getElementById("biennial-target-year");
  const intervalSelect = document.getElementById("biennial-interval");

  if (!targetSelect || !intervalSelect) return;

  // 🔁 セレクト初期化
  targetSelect.innerHTML = "";
  intervalSelect.innerHTML = "";

  // ✅ rows から採集年を動的に取得
  const years = rows
    .map(r => parseInt(r.collectionYear, 10))
    .filter(y => !isNaN(y));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  // 🔢 採集年：min〜max
  for (let y = minYear; y <= maxYear; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    targetSelect.appendChild(opt);
  }

  // 🔁 周期（2〜20年）
  for (let i = 2; i <= 20; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    intervalSelect.appendChild(opt);
  }
}

// ==================== CSV 読み込み関連 ====================
const loadCSV = async (url, callback) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const csvText = await response.text();
    callback(csvText);
  } catch (error) {
    console.error(`${url} の読み込みエラー:`, error);
  }
};

const loadLiteratureCSV = async () => {
  try {
    const response = await fetch("Literature.csv");
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const csvText = await response.text();

    literatureArray = [];
    const lines = csvText.split("\n").filter(line => line.trim());
    lines.forEach((line, index) => {
      if (index === 0) return; // ヘッダーをスキップ

      const columns = [];
      let current = "";
      let inQuotes = false;
      for (let char of line) {
        if (char === '"' && !inQuotes) {
          inQuotes = true; 
        } else if (char === '"' && inQuotes) {
          inQuotes = false;
        } else if (char === "," && !inQuotes) {
          columns.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      if (current) columns.push(current.trim());

      // 新: Lnumber, LID_CSV, LitList_en, LitList_jp, Link の順
      const [lnumber, id, litList_en, litList_jp, link] = columns;

      // 数値変換できなかった場合に備えて，lnumber はパース失敗時 index を使う
      const lnum = parseInt(lnumber, 10);
      literatureArray.push({
        lnumber: isNaN(lnum) ? index : lnum,
        id: (id || "").trim(),
        label_jp: (litList_jp || "").trim(),
        label_en: (litList_en || "").trim(),
        link: link ? link.trim() : null,
        // 旧コードで "order" と呼んでいたものは無理に入れなくてもOK
        // 必要なら lnumber を兼用してソート順を使う
      });
    });
  } catch (error) {
    console.error("Literature.csv の読み込みエラー:", error);
  }
};

function getLiteratureLabel(item) {
  // item: { id, label_jp, label_en, link, ... } の想定
  if (!item) {
    // 見つからない場合
    return (lang === "ja") ? "不明" : "Unknown";
  }
  if (lang !== "ja") {
    // 英語UIの場合 → 英語ラベルがあればそれを使い，無ければ日本語にfallback
    return item.label_en || item.label_jp || "Unknown";
  } else {
    // 日本語UIの場合 → 日本語ラベルがあればそれを使い，無ければ英語にfallback
    return item.label_jp || item.label_en || "不明";
  }
}

const loadTaxonNameCSV = () => {
  loadCSV("TaxonName.csv", (csvText) => {
    const lines = csvText.split("\n").filter(line => line.trim());
    lines.forEach((line, idx) => {
      if (idx === 0) return;

      const columns = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(col => col.replace(/^"|"$/g, '').trim());
      if (!columns || columns.length < 5) return;

      const [no, japaneseName, scientificName, authorYear, rank] = columns;

      taxonMap[scientificName] = {
        no: parseInt(no, 10),
        japaneseName: japaneseName || "-",
        authorYear: authorYear || "-",
        rank: rank || "-"
      };
    });
  });
};

function loadOrderCSV(fileName, arrayStorage, type) {
  return new Promise((resolve, reject) => {
    loadCSV(fileName, (csvText) => {
      const lines = csvText.split("\n").filter(line => line.trim());
      const header = lines[0].split(",");

      const noIdx = header.findIndex(h => h.toLowerCase().includes("no"));
      const jpIdx = header.findIndex(h => h.toLowerCase().includes("_jp"));
      const enIdx = header.findIndex(h => h.toLowerCase().includes("_en"));

      const tempArray = [];

      lines.slice(1).forEach(line => {
        const cols = line.split(",");
        const no = parseInt(cols[noIdx], 10);
        const jp = cols[jpIdx]?.trim() || "-";
        const en = cols[enIdx]?.trim() || "-";
        if (no && jp && en) {
          tempArray.push({ no, jp, en });
        }
      });

      tempArray.sort((a, b) => a.no - b.no);

      if (type === "prefecture") {
        prefectureOrder.length = 0;
        prefectureMeta.length = 0;
        tempArray.forEach(item => {
          prefectureOrder.push(item.jp);
          prefectureMeta.push({ jp: item.jp, en: item.en });
        });
      } else if (type === "island") {
        islandOrder.length = 0;
        islandMeta.length = 0;
        tempArray.forEach(item => {
          islandOrder.push(item.jp);
          islandMeta.push({ jp: item.jp, en: item.en });
        });
      }

      resolve();
    });
  });
}

const parseCSV = (text) => {
  const lines = text.split("\n").filter(line => line.trim());
  const headers = lines[0].split(",").map(h => h.replace(/\r/g, "").trim());

  const data = [];
  lines.slice(1).forEach(line => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let char of line) {
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        inQuotes = false;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    while (values.length < headers.length) {
      values.push("-");
    }

    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || "-";
    });
    data.push(record);
  });
  return data;
};

const loadDistributionCSV = async () => {
  try {
    const response = await fetch("DistributionRecord_web.csv");
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const csvText = await response.text();

    const parsedData = parseCSV(csvText);
    rows = parsedData.map(record => ({
      recordType: record["記録の分類_タイプ産地or標本記録or文献記録or疑わしいかどうか"] || "-",
      japaneseName: record["和名"] || "-",
      scientificName: record["学名"] || "-",
      latitude: parseFloat(record["Latitude_assumed"]) || null,
      longitude: parseFloat(record["Longitude_assumed"]) || null,
      date: record["日付"] || "-",
      prefecture: record["都道府県_jp"] || "-",
      island: record["島_jp"] || "-",
      genus: record["Genus"] || "-",
      family: record["Family"] || "-",
      order: record["Order"] || "-",
      population: record["個体数"] || "-",
      literatureID: record["文献ID"] || "-",
      page: record["掲載ページ"] || "-",
      original: record["オリジナル"] || "-",
      originalJapaneseName: record["文献中の和名"] || "-",
      originalScientificName: record["文献中で有効とされる学名_文献紹介など、その文献中で有効とされる学名がわからない場合はハイフンを記入してください。"] || "-",
      location: record["場所（原文ママ）"] || "-",
      note: record["メモ"] || "-",
      registrant: record["記入者"] || "-",
      registrationDate: record["記入日付"] || "-",
      adultPresence: record["成体の有無"] || "-",
      collectorJp: record["採集者_jp"] || "-",
      collectorEn: record["採集者_en"] || "-",
      collectionMonth: record["採集月"] || "-",
      collectionYear: record["採集年"] || "-",
      publicationYear: record["出版年"] || "-",
      taxonRank: record["階級"] || "-",
      undescribedSpecies: record["未記載種の可能性が高い_幼体等で同定が困難な場合はno"] || "-"
    }));

    initYearRanges();   // rows から最小値・最大値を計算
    initYearSliders();  // スライダーを生成

    initBiennialSelects();

  } catch (error) {
    console.error("CSV の読み込みエラー:", error);
  }
};

// ==================== フィルタリングロジック ====================
function initYearRanges() {
  rows.forEach(r => {
    // 出版年
    const pub = parseInt(r.publicationYear, 10);
    if (!isNaN(pub)) {
      if (pub < publicationYearMinValue) publicationYearMinValue = pub;
      if (pub > publicationYearMaxValue) publicationYearMaxValue = pub;
    }

    // 採集年
    const col = parseInt(r.collectionYear, 10);
    if (!isNaN(col)) {
      if (col < collectionYearMinValue) collectionYearMinValue = col;
      if (col > collectionYearMaxValue) collectionYearMaxValue = col;
    }
  });

  // 値がInfinityのままだとスライダー初期化できないので、万一空だったら仮置き
  if (publicationYearMinValue === Number.POSITIVE_INFINITY) {
    publicationYearMinValue = 1900;
    publicationYearMaxValue = 2050;
  }
  if (collectionYearMinValue === Number.POSITIVE_INFINITY) {
    collectionYearMinValue = 1900;
    collectionYearMaxValue = 2050;
  }
}

function initYearSliders() {
  // ▼ 出版年スライダー初期化
  $("#publication-year-slider").slider({
    range: true,
    min: publicationYearMinValue,
    max: publicationYearMaxValue,
    values: [publicationYearMinValue, publicationYearMaxValue],
    slide: function(event, ui) {
      // 1) スライダー操作中の値を即テキストボックスに反映
      $("#publication-year-min").val(ui.values[0]);
      $("#publication-year-max").val(ui.values[1]);

      // 2) 既存タイマーが走っていればクリア
      if (publicationTimerId) {
        clearTimeout(publicationTimerId);
      }
      // 3) 新しいタイマーを設定。DEBOUNCE_DELAY だけ操作が無ければフィルタ実行
      publicationTimerId = setTimeout(() => {
        applyFilters(true); // 実際のフィルタリング
        updateURL();
        publicationTimerId = null;
      }, DEBOUNCE_DELAY);
    },
    stop: function(event, ui) {
    }
  });

  // テキストボックスにもスライダー初期値を反映
  $("#publication-year-min").val(publicationYearMinValue);
  $("#publication-year-max").val(publicationYearMaxValue);

  // ▼ 採集年スライダー初期化
  $("#collection-year-slider").slider({
    range: true,
    min: collectionYearMinValue,
    max: collectionYearMaxValue,
    values: [collectionYearMinValue, collectionYearMaxValue],
    slide: function(event, ui) {
      $("#collection-year-min").val(ui.values[0]);
      $("#collection-year-max").val(ui.values[1]);

      // 既存タイマーが走っていればキャンセル
      if (collectionTimerId) {
        clearTimeout(collectionTimerId);
      }
      // 新しいタイマーセット
      collectionTimerId = setTimeout(() => {
        applyFilters(true);
        updateURL();
        collectionTimerId = null;
      }, DEBOUNCE_DELAY);
    }
  });

  $("#collection-year-min").val(collectionYearMinValue);
  $("#collection-year-max").val(collectionYearMaxValue);

  // ▼ テキストボックス編集時もデバウンス
  $("#publication-year-min, #publication-year-max").on("change", function() {
    if (publicationTimerId) {
      clearTimeout(publicationTimerId);
    }
    publicationTimerId = setTimeout(() => {
      const minVal = parseInt($("#publication-year-min").val(), 10);
      const maxVal = parseInt($("#publication-year-max").val(), 10);
      // スライダーに反映
      $("#publication-year-slider").slider("values", 0, minVal);
      $("#publication-year-slider").slider("values", 1, maxVal);

      applyFilters(true);
      updateURL();
      publicationTimerId = null;
    }, DEBOUNCE_DELAY);
  });

  $("#collection-year-min, #collection-year-max").on("change", function() {
    if (collectionTimerId) {
      clearTimeout(collectionTimerId);
    }
    collectionTimerId = setTimeout(() => {
      const minVal = parseInt($("#collection-year-min").val(), 10);
      const maxVal = parseInt($("#collection-year-max").val(), 10);
      $("#collection-year-slider").slider("values", 0, minVal);
      $("#collection-year-slider").slider("values", 1, maxVal);

      applyFilters(true);
      updateURL();
      collectionTimerId = null;
    }, DEBOUNCE_DELAY);
  });
}

const getFilterStates = () => {
  const filters = {
    species: document.getElementById("filter-species").value,
    genus: document.getElementById("filter-genus").value,
    family: document.getElementById("filter-family").value,
    order: document.getElementById("filter-order").value,
    prefecture: document.getElementById("filter-prefecture").value,
    island: document.getElementById("filter-island").value,
    literature: document.getElementById("filter-literature").value
  };

  const checkboxes = {
    excludeUnpublished: document.getElementById("exclude-unpublished").checked,
    excludeDubious: document.getElementById("exclude-dubious").checked,
    excludeCitation: document.getElementById("exclude-citation").checked,
    filterType: document.getElementById("filter-type").checked,
    filterIntegratedType: document.getElementById("filter-synonymized-type").checked,
    filterDoubtfulType: document.getElementById("filter-doubtful-type").checked,
    filterDoubtfulIntegratedType: document.getElementById("filter-doubtful-synonymized-type").checked,
    filterSpecimen: document.getElementById("filter-specimen").checked,
    filterLiteratureRecord: document.getElementById("filter-literature-record").checked,
    filterDoubtfulLiterature: document.getElementById("filter-doubtful-literature").checked,
    excludeUndescribed: document.getElementById("exclude-undescribed").checked,
    excludeUnspecies: document.getElementById("exclude-unspecies").checked
  };

  return { filters, checkboxes };
};

const filterByCheckbox = (data, checkboxes) => {
  return data.filter(row => {
    const isUnpublished = row.literatureID === "-" || row.literatureID === "";
    const isDubious = ["3_疑わしいタイプ産地", "4_疑わしい統合された種のタイプ産地", "7_疑わしい文献記録"].includes(row.recordType);
    const isCitation = (row.original.toLowerCase() === "no");

    if (checkboxes.excludeUndescribed && row.undescribedSpecies.toLowerCase() === "yes") {
      return false;
    }
    const allowedRanks = ["species", "subspecies"];
    if (checkboxes.excludeUnspecies && !allowedRanks.includes(row.taxonRank.toLowerCase())) {
      return false;
    }
    if (checkboxes.excludeUnpublished && isUnpublished) return false;
    if (checkboxes.excludeDubious && isDubious) return false;
    if (checkboxes.excludeCitation && isCitation) return false;

    const recordTypeFilter = {
      "1_タイプ産地": checkboxes.filterType,
      "2_統合された種のタイプ産地": checkboxes.filterIntegratedType,
      "3_疑わしいタイプ産地": checkboxes.filterDoubtfulType,
      "4_疑わしい統合された種のタイプ産地": checkboxes.filterDoubtfulIntegratedType,
      "5_標本記録": checkboxes.filterSpecimen,
      "6_文献記録": checkboxes.filterLiteratureRecord,
      "7_疑わしい文献記録": checkboxes.filterDoubtfulLiterature
    };
    if (!recordTypeFilter[row.recordType]) {
      return false;
    }
    return true;
  });
};

const gatherSelectOptions = (data) => {
  const literatureOptions = literatureArray
    .filter(item => data.some(row => row.literatureID === item.id))
    .map(item => ({ value: item.id, label: item.label }));

  const combinedNames = [...new Set(data.map(row => `${row.scientificName} / ${row.japaneseName}`))]
    .sort();

  const getOptions = (dataKey) => {
    const uniqueMap = new Map();
    data.forEach(r => {
      const val = r[dataKey] || "-";
      if (!uniqueMap.has(val)) {
        const jName = taxonMap[val]?.japaneseName || "-";
        const label = (lang === "ja") ? `${val} / ${jName}` : val;
        uniqueMap.set(val, { value: val, label });
      }
    });
    const arr = Array.from(uniqueMap.values());
    arr.sort((a, b) => {
      if (a.value === "-") return 1;
      if (b.value === "-") return -1;
      return a.value.localeCompare(b.value);
    });
    return arr;
  };

  const getPrefIslandOptions = (dataKey, refArray, metaArray) => {
    return refArray
      .filter(item => data.some(row => row[dataKey] === item))
      .map(item => {
        const match = metaArray.find(m => m.jp === item);
        const label = (lang !== "ja" && match?.en) ? match.en : item;
        return { value: item, label };
      });
  };

  return {
    literatureOptions,
    combinedNames,
    genusOptions: getOptions("genus"),
    familyOptions: getOptions("family"),
    orderOptions: getOptions("order"),
    prefectureOptions: getPrefIslandOptions("prefecture", prefectureOrder, prefectureMeta),
    islandOptions: getPrefIslandOptions("island", islandOrder, islandMeta),
  };
};

const populateSelect = (selectId, options, selectedValue) => {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  // 1) もともとのセレクトボックスの値を変数化
  //    selectedValueがあれば、それを優先
  const currentVal = (selectedValue != null) ? selectedValue : selectEl.value;

  // 2) プレースホルダ文字列を取得（無ければ"選択"）
  const placeholderKey = SELECT_PLACEHOLDERS[selectId];
  const defaultText = (
    (placeholderKey && translations?.[lang]?.[placeholderKey])
    || (placeholderKey && translations?.["ja"]?.[placeholderKey])
    || "選択"
  );

  // 3) セレクトを一旦クリア
  $(selectEl).empty();

  // 4) 先頭にプレースホルダ用 option を追加（値は空文字）
  $(selectEl).append(new Option(defaultText, "", false, false));

  // 5) 渡された options[] を使って動的に option を追加
  options.forEach(opt => {
    $(selectEl).append(new Option(opt.label, opt.value, false, false));
  });

  // 6) 「currentVal」が options内に無い場合、手動で追加する
  const exists = options.some(opt => opt.value === currentVal);
  if (currentVal && !exists) {
    // UI上で消えてほしくない「孤立した値」なら再追加する
    $(selectEl).append(new Option(currentVal, currentVal, true, true));
  } else {
    // そうでなければ、既存の option の中から currentVal をセット
    $(selectEl).val(currentVal);
  }

  $(selectEl).val(currentVal);
  
};

// プレースホルダー辞書
const SELECT_PLACEHOLDERS = {
  "filter-order":      "select_order",
  "filter-family":     "select_family",
  "filter-genus":      "select_genus",
  "filter-species":    "select_species",
  "filter-prefecture": "select_prefecture",
  "filter-island":     "select_island",
  "filter-literature": "select_literature"
};

const updateSelectBoxes = (filters, selectOptions) => {
  const {
    literatureOptions,
    combinedNames,
    genusOptions,
    familyOptions,
    orderOptions,
    prefectureOptions,
    islandOptions
  } = selectOptions;

  // ▼ filter-literature
  //    map 内で fallback を適用するには、literatureArray から該当itemを探して
  //    getLiteratureLabel() を呼ぶのが確実です
  populateSelect(
    "filter-literature",
    literatureOptions.map(opt => {
      // opt.value が文献ID，opt.label が既存のラベル。
      // もともと `opt.label.replace(/<\/?i>/g, '')` だけでしたが，
      // 新CSVによりラベルが2種類になったので fallback を適用。
      const item = literatureArray.find(i => i.id === opt.value);
      const label = getLiteratureLabel(item).replace(/<\/?i>/g, '');
      return {
        value: opt.value,
        label
      };
    }),
    filters.literature
  );

  // 種リストなどは既存の combinedNames をそのまま使う
  populateSelect(
    "filter-species",
    combinedNames.map(name => ({
      value: name,
      label: (lang === "ja") ? name : String(name).split(" / ")[0]
    })),
    filters.species
  );

  populateSelect("filter-genus", genusOptions, filters.genus);
  populateSelect("filter-family", familyOptions, filters.family);
  populateSelect("filter-order", orderOptions, filters.order);
  populateSelect("filter-prefecture", prefectureOptions, filters.prefecture);
  populateSelect("filter-island", islandOptions, filters.island);
};

const updateFilters = (filteredData, filtersOverride = null) => {
  const filters = filtersOverride ?? getFilterStates().filters;
  const selectOptions = gatherSelectOptions(filteredData);
  updateSelectBoxes(filters, selectOptions);
  updateSpeciesListInTab();
  updatePrefectureListInTab();
  updateIslandListInTab();
};

const applyFilters = async (updateMap = true, filtersOverride = null) => {
  try {
    const { filters, checkboxes } = filtersOverride
      ? { filters: filtersOverride, checkboxes: getFilterStates().checkboxes }
      : getFilterStates();

    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }

    let filteredRowsLocal = rows.filter(row => {
      const combinedName = `${row.scientificName} / ${row.japaneseName}`;
      return (
        (filters.species === "" || combinedName === filters.species) &&
        (filters.genus === "" || row.genus === filters.genus) &&
        (filters.family === "" || row.family === filters.family) &&
        (filters.order === "" || row.order === filters.order) &&
        (filters.prefecture === "" || row.prefecture === filters.prefecture) &&
        (filters.island === "" || row.island === filters.island) &&
        (filters.literature === "" || row.literatureID === filters.literature)
      );
    });

    filteredRowsLocal = filterByCheckbox(filteredRowsLocal, checkboxes);

    // 出版年フィルタ
    const usePublicationYear = $("#filter-publication-year-active").is(":checked");
    if (usePublicationYear) {
      const minPub = parseInt($("#publication-year-min").val(), 10);
      const maxPub = parseInt($("#publication-year-max").val(), 10);
      filteredRowsLocal = filteredRowsLocal.filter(r => {
        const py = parseInt(r.publicationYear, 10);
        return !isNaN(py) && py >= minPub && py <= maxPub;
      });
    }

    // 採集年フィルタ
    const useCollectionYear = $("#filter-collection-year-active").is(":checked");
    if (useCollectionYear) {
      const minCol = parseInt($("#collection-year-min").val(), 10);
      const maxCol = parseInt($("#collection-year-max").val(), 10);
      filteredRowsLocal = filteredRowsLocal.filter(r => {
        const cy = parseInt(r.collectionYear, 10);
        return !isNaN(cy) && cy >= minCol && cy <= maxCol;
      });
    }

    // 隔年発生フィルタ
    const useBiennial = $("#filter-biennial-active").is(":checked");
    if (useBiennial) {
      const targetYear = parseInt($("#biennial-target-year").val(), 10);
      const interval = parseInt($("#biennial-interval").val(), 10);
      if (!isNaN(targetYear) && !isNaN(interval) && interval > 0) {
        filteredRowsLocal = filteredRowsLocal.filter(r => {
          const cy = parseInt(r.collectionYear, 10);
          return !isNaN(cy) && (cy - targetYear) % interval === 0;
        });
      }
    }

    // 採集月フィルタ（1〜12月 + 不明）
    const useCollectionMonth = $("#filter-collection-month-active").is(":checked");
    if (useCollectionMonth) {
      const selectedMonthValues = $(".collection-month:checked").map(function () {
        return String(this.value);
      }).get();

      if (selectedMonthValues.length > 0) {
        const selectedSet = new Set(selectedMonthValues);
        const includeUnknown = selectedSet.has("unknown");

        filteredRowsLocal = filteredRowsLocal.filter(r => {
          const cm = parseInt(r.collectionMonth, 10);
          const isValidMonth = Number.isFinite(cm) && cm >= 1 && cm <= 12;

          if (isValidMonth) {
            return selectedSet.has(String(cm));
          }
          // 数値として解釈できない / 範囲外 → 「不明」扱い
          return includeUnknown;
        });
      }
    }

    // ライフステージフィルタ
    const useLifeStage = $("#filter-life-stage-active").is(":checked");
    if (useLifeStage) {
      const selectedStages = $(".life-stage:checked").map(function () {
        return this.value;
      }).get();
      if (selectedStages.length > 0) {
        filteredRowsLocal = filteredRowsLocal.filter(r => {
          const raw = (r.adultPresence || "").trim().toLowerCase();
          const normalized = (raw === "yes") ? "yes" : "no";
          return selectedStages.includes(normalized);
        });
      }
    }

// 矩形選択（BBox）フィルタ
if (boxBounds) {
  const { west, south, east, north } = boxBounds;
  filteredRowsLocal = filteredRowsLocal.filter(r => {
    const lon = parseFloat(r.longitude);
    const lat = parseFloat(r.latitude);
    if (Number.isNaN(lon) || Number.isNaN(lat)) return false;
    return (lon >= west && lon <= east && lat >= south && lat <= north);
  });
}

filteredRows = filteredRowsLocal;

    // 🔧 filtersOverride を渡す！
    updateFilters(filteredRowsLocal, filters);

    initializeSelect2();
    updateSelectedLabels();

    updateRecordInfo(
      filteredRowsLocal.length,
      new Set(filteredRowsLocal.map(r => `${r.latitude},${r.longitude}`)).size
    );

    generateLiteratureList(filteredRowsLocal);

    if (updateMap) {
      displayMarkers(filteredRowsLocal);
      generateMonthlyChart(filteredRowsLocal);
      generatePrefectureChart(filteredRowsLocal);
      const mode = document.querySelector('input[name="year-mode"]:checked')?.value || 'publication';
      updateYearChart();
    }

    updateDropdownPlaceholders();

  } catch (error) {
    console.error("applyFilters中にエラー:", error);
  }
};

// ==================== 文献リスト ====================
const updateLiteratureList = (titles) => {
  const listContainer = document.getElementById('literature-list');
  if (!listContainer) return;

  if (titles.length === 0) {
    listContainer.style.display = "none";
    return;
  }

  listContainer.style.display = "block";

  // 言語に応じてタイトルを変更
  const headingText = translations[lang]?.reference || "引用文献 Reference";
  listContainer.innerHTML = `<h3>${headingText}</h3>`;

  const ordered = literatureArray.filter(item => {
    const labelText = getLiteratureLabel(item);
    return titles.includes(labelText);
  });

  const ol = document.createElement('ol');
  ordered.forEach(item => {
    let listItem = getLiteratureLabel(item);
    if (item.link) {
      listItem += ` <a href="${item.link}" target="_blank">${item.link}</a>`;
    }
    const li = document.createElement('li');
    li.innerHTML = listItem;
    ol.appendChild(li);
  });
  listContainer.appendChild(ol);
};

const generateLiteratureList = (filteredData) => {
  const litNames = new Set();
  filteredData.forEach(row => {
    if (!row.literatureID || row.literatureID === "-") return;
    const { literatureName } = getLiteratureInfo(row.literatureID);
    if (literatureName !== "不明") {
      litNames.add(literatureName);
    }
  });
  updateLiteratureList([...litNames]);
};

const getLiteratureInfo = (literatureID) => {
  // literatureArray から対象の文献情報を探します
  const item = literatureArray.find(i => i.id === literatureID);

  if (!item) {
    // 見つからないときのフォールバック
    return {
      literatureName: (lang === "ja") ? "不明" : "Unknown",
      literatureLink: null
    };
  }

  // 英語／日本語のラベルを取得
  const name = getLiteratureLabel(item);

  return {
    literatureName: name,
    literatureLink: item.link || null
  };
};

// ==================== Select2 初期化 ====================
const initializeSelect2 = () => {
  // 既存のSelect2をすべて破棄 & イベント解除
  Object.keys(SELECT_PLACEHOLDERS).forEach(key => {
    const id = "#" + key;
    const $el = $(id);
    if ($el.data("select2")) {
      $el.select2("destroy");
    }
    $el.off();
  });

  // セレクトボックス一覧 (辞書のキーを使って組み立て)
  const selectBoxes = Object.keys(SELECT_PLACEHOLDERS).map(key => {
    return { id: "#" + key, baseKey: key };
  });

  const safelyInitSelect2 = (id, placeholder, extraOptions = {}) => {
    try {
      const currentVal = $(id).val();

      $(id).select2({
        placeholder,
        allowClear: false,
        minimumResultsForSearch: 0,
        dropdownAutoWidth: true,
        ...extraOptions
      });

      if (currentVal) {
        $(id).val(currentVal);
      }
      return true;
    } catch (e) {
      console.error(`Select2初期化エラー(${id}):`, e);
      return false;
    }
  };

  // クリアボタン挿入 (省略せず完全実装)
  const setupCustomClearButton = (id) => {
    const selectElement = $(id);
    const selectContainer = selectElement.next('.select2-container');

    selectContainer.find('.custom-select2-clear').remove();
    const arrow = selectContainer.find('.select2-selection__arrow');
    const clearButton = $('<span class="custom-select2-clear">✕</span>');
    arrow.parent().append(clearButton);

    const updateButtonsVisibility = () => {
      if (selectElement.val()) {
        arrow.hide();
        clearButton.show();
      } else {
        arrow.show();
        clearButton.hide();
      }
    };

    updateButtonsVisibility();

    clearButton.on('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      selectElement.val(null).trigger('change');
      updateButtonsVisibility();

      applyFilters(true);
      updateURL();
      updateSelectedLabels();

      return false;
    });

    selectContainer.css('position', 'relative');
    selectElement.on('change', updateButtonsVisibility);
    selectElement.on('select2:open select2:close', updateButtonsVisibility);
  };

  // すでに値がある場合ドロップダウンを開かない処理
  const blockOpenIfHasValue = (id) => {
    $(id).on('select2:opening', function(e) {
      if ($(this).val()) {
        e.preventDefault();
      }
    });
    const $container = $(id).next('.select2-container');
    $container.find('.select2-selection').on('mousedown', (e) => {
      if ($(id).val()) {
        e.preventDefault();
      }
    });
  };

  // ▼ 一括初期化
  selectBoxes.forEach(({ id, baseKey }) => {
    // プレースホルダー文字列 (辞書 + 件数)
    const baseText = SELECT_PLACEHOLDERS[baseKey] || "選択";
    const count = $(id).find("option:not(:first-child)").length;
    const placeholderWithCount = getPlaceholderTextFor(baseKey, count);

    // Select2 初期化
    const ok = safelyInitSelect2(id, placeholderWithCount);

    if (ok) {
      setupCustomClearButton(id);

      $(id).on("select2:select", () => {
        applyFilters(true);
        updateURL();
        updateSelectedLabels();
        updateRecordInfo(
          filteredRows.length,
          new Set(filteredRows.map(r => `${r.latitude},${r.longitude}`)).size
        );
      });

      blockOpenIfHasValue(id);
    }
  });

  // 遅延で再セット
  setTimeout(() => {
    selectBoxes.forEach(({ id }) => {
      setupCustomClearButton(id);
      blockOpenIfHasValue(id);
    });
  }, 500);
};


/**
 * localStorage の preferredLanguage を読み取り、翻訳済みのプレースホルダ文字列に
 * 件数 (count) を付与して返す。
 */
function getPlaceholderTextFor(baseKey, count) {
  const i18nKey = SELECT_PLACEHOLDERS[baseKey];
  if (!i18nKey) {
    // fallback (どのキーにも該当しない場合)
    return `選択（${count}件）`;
  }

  // translation.js の translations[lang][i18nKey] を取り出す
  const baseText =
    translations[lang]?.[i18nKey]  // 例: "Select order"
    || translations["ja"]?.[i18nKey] // もし英語が無ければ日本語
    || "選択"; // 最終fallback

  // 件数を後ろに付けて返す
  if (lang === "ja") {
    // → "目を選択（3件）"
    return `${baseText}（${count}件）`;
  } else {
    // → "Select order (3)" のように
    return `${baseText} (${count})`;
  }
}

// ドロップダウンのプレースホルダー更新関数
const updateDropdownPlaceholders = () => {
  Object.keys(SELECT_PLACEHOLDERS).forEach(key => {
    const id = "#" + key;
    const selectEl = $(id);
    if (!selectEl.data("select2")) return;

    const count = selectEl.find("option:not(:first-child)").length;

    try {
      const select2Instance = selectEl.data('select2');
      if (select2Instance && select2Instance.$container) {
        const placeholderElement = select2Instance.$container.find('.select2-selection__placeholder');
        if (placeholderElement.length) {
          const placeholderText = getPlaceholderTextFor(key, count);
          placeholderElement.text(placeholderText);
        }
      }

      // 矢印 or クリアボタンの表示更新
      const selectContainer = selectEl.next('.select2-container');
      const arrow = selectContainer.find('.select2-selection__arrow');
      const clearButton = selectContainer.find('.custom-select2-clear');
      if (selectEl.val()) {
        arrow.hide();
        clearButton.show();
      } else {
        arrow.show();
        clearButton.hide();
      }
    } catch (e) {
      console.error(`プレースホルダー更新エラー(${id}):`, e);
    }
  });
};


// 採集月チェックボックス（1〜12月 + 不明）を一括でON/OFFする
function setAllCollectionMonthCheckboxes(checked) {
  document.querySelectorAll(".collection-month").forEach(cb => {
    cb.checked = !!checked;
  });
}

// チェックボックスイベントのセットアップ関数
function setupCheckboxListeners() {
  const checkboxIds = [
    "exclude-unpublished",
    "exclude-dubious",
    "exclude-citation",
    "exclude-undescribed",
    "exclude-unspecies",
    "filter-publication-year-active",
    "filter-collection-year-active",
    "filter-biennial-active",
    "filter-collection-month-active",
    "filter-life-stage-active"
  ];

  const updateUIIds = new Set([
    "filter-publication-year-active",
    "filter-collection-year-active",
    "filter-biennial-active",
    "filter-collection-month-active",
    "filter-life-stage-active"
  ]);

  // 既存のイベントリスナーを全て解除（クローンで置き換え）
  checkboxIds.forEach(id => {
    const cb = document.getElementById(id);
    if (cb) {
      const clone = cb.cloneNode(true);
      cb.parentNode.replaceChild(clone, cb);
    }
  });

  document.querySelectorAll(".marker-filter-checkbox").forEach(checkbox => {
    const clone = checkbox.cloneNode(true);
    checkbox.parentNode.replaceChild(clone, checkbox);
  });

  // 新しいイベントリスナーを設定
  checkboxIds.forEach(id => {
    const cb = document.getElementById(id);
    if (cb) {
      cb.addEventListener("change", () => {
        // 採集月フィルターのON/OFF時は、1〜12月 + 不明をまとめて切り替える
        if (id === "filter-collection-month-active") {
          setAllCollectionMonthCheckboxes(cb.checked);
        }

        if (updateUIIds.has(id)) {
          updateFilterActivationUI(); // ← フィルターUI更新
        }
        applyFilters(true);
        updateURL();
      });
    }
  });

  document.querySelectorAll(".marker-filter-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      applyFilters(true);
      updateURL();
    });
  });
  
  document.querySelectorAll(".collection-month").forEach(cb => {
    cb.addEventListener("change", () => {
      // 採集月フィルターがOFFでも、特定の月を選べるようにする：
      // 月のどれかがチェックされたら、自動でフィルターをONにして選択を有効化する
      const master = document.getElementById("filter-collection-month-active");
      const anyChecked = !!document.querySelector(".collection-month:checked");
      if (master && !master.checked && anyChecked) {
        // プログラム的にONにする（changeイベントは発火しないので「全選択」にはならない）
        master.checked = true;
        updateFilterActivationUI();
      }

      applyFilters(true);
      updateURL();
    });
  });
  
  document.querySelectorAll(".life-stage").forEach(cb => {
    cb.addEventListener("change", () => {
      applyFilters(true);
      updateURL();
    });
  });

  document.getElementById("biennial-target-year").addEventListener("change", () => {
    applyFilters(true);
    updateURL();
  });
  
  document.getElementById("biennial-interval").addEventListener("change", () => {
    applyFilters(true);
    updateURL();
  });

  // 初期状態のフィルターUI適用（ページロード時）
  updateFilterActivationUI();
}

// ==================== 前/次ボタンによる選択肢移動 ====================
const setupNavButtonListeners = () => {
  const config = [
    { prevBtn: "prev-species", nextBtn: "next-species", selId: "filter-species" },
    { prevBtn: "prev-genus", nextBtn: "next-genus", selId: "filter-genus" },
    { prevBtn: "prev-family", nextBtn: "next-family", selId: "filter-family" },
    { prevBtn: "prev-order", nextBtn: "next-order", selId: "filter-order" },
    { prevBtn: "prev-prefecture", nextBtn: "next-prefecture", selId: "filter-prefecture" },
    { prevBtn: "prev-island", nextBtn: "next-island", selId: "filter-island" },
    { prevBtn: "prev-literature", nextBtn: "next-literature", selId: "filter-literature" },
    // ▼ 隔年発生
    { prevBtn: "prev-biennial-year", nextBtn: "next-biennial-year", selId: "biennial-target-year" },
    { prevBtn: "prev-biennial-interval", nextBtn: "next-biennial-interval", selId: "biennial-interval" }
  ];

  config.forEach(({ prevBtn, nextBtn, selId }) => {
    const prev = document.getElementById(prevBtn);
    const next = document.getElementById(nextBtn);

    if (prev) {
      prev.addEventListener("click", () => navigateOption(selId, "prev"));
    }
    if (next) {
      next.addEventListener("click", () => navigateOption(selId, "next"));
    }
  });
};

const navigateOption = async (selectId, direction) => {
  const select = document.getElementById(selectId);
  if (!select) return;
  const selectedVal = select.value;

  select.value = "";
  await applyFilters(false);
  updateURL();

  const updatedVals = Array.from(select.options)
    .map(opt => opt.value)
    .filter(v => v !== "");
  if (!updatedVals.length) return;

  let idx = updatedVals.indexOf(selectedVal);
  let newVal = selectedVal;
  if (direction === "prev") {
    newVal = updatedVals[(idx - 1 + updatedVals.length) % updatedVals.length];
  } else if (direction === "next") {
    newVal = updatedVals[(idx + 1) % updatedVals.length];
  }

  select.value = newVal;
  await applyFilters(true);
  updateURL();
};

// ==================== リセットボタン ====================
const setupResetButton = () => {
  const resetBtn = document.getElementById("reset-button");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      [
        "filter-species",
        "filter-genus",
        "filter-family",
        "filter-order",
        "filter-prefecture",
        "filter-island",
        "filter-literature"
      ].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.selectedIndex = 0;
      });

      clearMarkers();
      updateSelectedLabels();
      if (typeof clearBoxSelection === "function") {
        clearBoxSelection({ apply: false });
        if (typeof setBoxSelectMode === "function") setBoxSelectMode(false);
      }
      applyFilters(true);
      updateURL();
    });
  }
};

// ==================== レジェンドのトグル ====================
const setupLegendToggle = () => {
  const legend = document.querySelector(".legend");
  const legendToggleButton = document.querySelector(".legend-toggle-button");
  if (!legend || !legendToggleButton) return;
  legendToggleButton.addEventListener("click", () => {
    legend.classList.toggle("collapsed");
  });
};

const setupPopupClose = () => {
  document.addEventListener("click", (e) => {
    if (!activePopup) return;
    const pops = document.querySelectorAll(".maplibregl-popup");
    const inside = [...pops].some(popup => popup.contains(e.target));
    if (!inside) {
      activePopup.remove();
      activePopup = null;
    }
  }, true);
};

const setupSearchContainerToggle = () => {
  const searchContainer = document.querySelector(".search-container");
  const toggleButton = document.getElementById("toggle-button");
  if (!searchContainer || !toggleButton) return;
  toggleButton.addEventListener("click", () => {
    searchContainer.classList.toggle("closed");
    toggleButton.classList.toggle("rotate");
  });
};

// ==================== ポップアップ & マーカー ====================
const clearMarkers = () => {
  markers.forEach(m => m.remove());
  markers = [];
  if (map.getSource("clusters")) {
    map.removeLayer("clusters");
    map.removeLayer("cluster-count");
    map.removeLayer("unclustered-point");
    map.removeSource("clusters");
  }
};

const displayMarkers = (filteredData) => {
  clearMarkers();
  filteredRows = filteredData;

  const priority = {
    "1_タイプ産地": 7,
    "2_統合された種のタイプ産地": 6,
    "3_疑わしいタイプ産地": 5,
    "4_疑わしい統合された種のタイプ産地": 4,
    "5_標本記録": 3,
    "6_文献記録": 2,
    "7_疑わしい文献記録": 1
  };

  const mapBounds = map.getBounds();
  const mapWidth = map.getContainer().offsetWidth;
  const mapHeight = map.getContainer().offsetHeight;
  const pixelRatioLng = Math.abs(mapBounds._ne.lng - mapBounds._sw.lng) / mapWidth;
  const pixelRatioLat = Math.abs(mapBounds._ne.lat - mapBounds._sw.lat) / mapHeight;
  const thresholdLng = pixelRatioLng * 5;
  const thresholdLat = pixelRatioLat * 5;

  const selectedMarkers = [];

  filteredData.forEach(row => {
    if (!row.latitude || !row.longitude) return;
    let isNearby = false;
    let nearbyIndex = -1;

    for (let i = 0; i < selectedMarkers.length; i++) {
      const ex = selectedMarkers[i];
      if (
        Math.abs(ex.latitude - row.latitude) <= thresholdLat &&
        Math.abs(ex.longitude - row.longitude) <= thresholdLng
      ) {
        isNearby = true;
        nearbyIndex = i;
        break;
      }
    }
    if (isNearby) {
      if (priority[row.recordType] > priority[selectedMarkers[nearbyIndex].recordType]) {
        selectedMarkers[nearbyIndex] = row;
      }
    } else {
      selectedMarkers.push(row);
    }
  });

  const sortedMarkers = selectedMarkers.sort((a, b) => priority[a.recordType] - priority[b.recordType]);

  let tooltip = document.querySelector(".marker-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "marker-tooltip";
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = translations[lang]?.click_for_details || "クリックで詳細表示";

  let isTouchDevice = false;

  sortedMarkers.forEach(row => {
    const { className, color, borderColor } = getMarkerStyle(row.recordType);
    const el = document.createElement('div');
    el.className = `${className} marker-clickable`;
    el.style.backgroundColor = color;
    if (borderColor) el.style.borderColor = borderColor;

    const marker = new maplibregl.Marker(el)
      .setLngLat([row.longitude, row.latitude])
      .addTo(map);

    el.addEventListener("mouseenter", (e) => {
      if (!isTouchDevice && !isZooming) {
        tooltip.style.display = "block";
        tooltip.style.left = `${e.pageX + 10}px`;
        tooltip.style.top = `${e.pageY + 10}px`;
      }
    });
    el.addEventListener("mousemove", (e) => {
      if (!isTouchDevice) {
        tooltip.style.left = `${e.pageX + 10}px`;
        tooltip.style.top = `${e.pageY + 10}px`;
      }
    });
    el.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
    el.addEventListener("touchstart", () => {
      isTouchDevice = true;
      tooltip.style.display = "none";
    });
    el.addEventListener("click", () => handleMarkerClick(marker, row));

    markers.push(marker);
  });
};

const getMarkerStyle = (recordType) => {
  switch (recordType) {
    case "1_タイプ産地":
      return { className: "marker marker-star", color: "blue" };
    case "2_統合された種のタイプ産地":
      return { className: "marker marker-square", color: "purple", borderColor: "black" };
    case "3_疑わしいタイプ産地":
      return { className: "marker marker-star", color: "pink", borderColor: "black" };
    case "4_疑わしい統合された種のタイプ産地":
      return { className: "marker marker-square", color: "pink", borderColor: "black" };
    case "5_標本記録":
      return { className: "marker marker-circle", color: "red", borderColor: "darkred" };
    case "6_文献記録":
      return { className: "marker marker-circle", color: "white", borderColor: "red" };
    case "7_疑わしい文献記録":
      return { className: "marker marker-cross", color: "pink", borderColor: "black" };
    default:
      return { className: "marker marker-circle", color: "gray", borderColor: "black" };
  }
};

const handleMarkerClick = (marker, record) => {
  nearbyRecords = getNearbyRecords(record);
  currentPopupIndex = 0;
  showPopup(currentPopupIndex);
};

const getNearbyRecords = (clickedRecord) => {
  const proximityThreshold = 10;
  const mapBounds = map.getBounds();
  const mapWidth = map.getContainer().offsetWidth;
  const pixelRatio = Math.abs(mapBounds._ne.lng - mapBounds._sw.lng) / mapWidth;
  const thresholdDegrees = proximityThreshold * pixelRatio;

  let near = filteredRows.filter(r => {
    if (!r.latitude || !r.longitude) return false;
    const dist = Math.sqrt(
      (r.latitude - clickedRecord.latitude) ** 2 +
      (r.longitude - clickedRecord.longitude) ** 2
    );
    return dist <= thresholdDegrees;
  });

  const priority = {
    "1_タイプ産地": 7,
    "2_統合された種のタイプ産地": 6,
    "3_疑わしいタイプ産地": 5,
    "4_疑わしい統合された種のタイプ産地": 4,
    "5_標本記録": 3,
    "6_文献記録": 2,
    "7_疑わしい文献記録": 1
  };
  near = near.sort((a, b) => {
    if (a === clickedRecord) return -1;
    if (b === clickedRecord) return 1;
    return (priority[b.recordType] || 0) - (priority[a.recordType] || 0);
  });
  return near;
};

const showPopup = (index, preserveAnchor = false) => {
  if (!nearbyRecords.length) return;

  const record = nearbyRecords[index];
  const total = nearbyRecords.length;

  if (activePopup) activePopup.remove();

  const markerPixel = map.project([record.longitude, record.latitude]);
  const mapHeight = map.getContainer().offsetHeight;

  const margin = 80;
  const distanceFromTop = markerPixel.y;
  const distanceFromBottom = mapHeight - markerPixel.y;

  let showAbove, anchor;

  if (preserveAnchor && currentAnchor && currentShowAbove !== null) {
    // ナビゲーション時：前回の anchor を維持
    anchor = currentAnchor;
    showAbove = currentShowAbove;
  } else {
    // 初回またはマーカークリック時：anchor 判定
    showAbove = distanceFromTop >= distanceFromBottom;
    anchor = showAbove ? "bottom" : "top";
    currentAnchor = anchor;
    currentShowAbove = showAbove;
  }

  // 高さを事前に計算
  const maxHeight = showAbove
    ? Math.max(100, distanceFromTop - margin)
    : Math.max(100, distanceFromBottom - margin);

  // 内容を取得
  const { popupContent } = preparePopupContent([record]).popupContents[0];

  // ナビゲーションHTML
  const navHtml = `
    <div class="popup-nav-fixed">
      <button id="prev-popup">前へ</button>
      <span>${index + 1} / ${total}</span>
      <button id="next-popup">次へ</button>
    </div>`;

  // ちらつき防止のため、max-height をインラインで指定
  const popupHtml = `
    <div class="popup-wrapper">
      ${!showAbove ? navHtml : ""}
      <div class="popup-scroll-container" style="max-height: ${maxHeight}px;">
        ${popupContent}
      </div>
      ${showAbove ? navHtml : ""}
    </div>`;

  activePopup = new maplibregl.Popup({
    focusAfterOpen: false,
    closeOnClick: false,
    anchor: anchor
  })
    .setLngLat([record.longitude, record.latitude])
    .setHTML(popupHtml)
    .addTo(map);

  document.getElementById("prev-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex - 1 + total) % total;
    showPopup(currentPopupIndex, true);
  });

  document.getElementById("next-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex + 1) % total;
    showPopup(currentPopupIndex, true);
  });
};

const preparePopupContent = (filteredData) => {
  const recordTypeMapping = {
    "1_タイプ産地": translations[lang]?.legend_type || "タイプ産地",
    "2_統合された種のタイプ産地": translations[lang]?.legend_synonymized_type || "統合された種のタイプ産地",
    "3_疑わしいタイプ産地": translations[lang]?.legend_doubtful_type || "疑わしいタイプ産地",
    "4_疑わしい統合された種のタイプ産地": translations[lang]?.legend_doubtful_synonymized_type || "疑わしい統合された種のタイプ産地",
    "5_標本記録": translations[lang]?.legend_specimen || "標本記録",
    "6_文献記録": translations[lang]?.legend_literature_record || "文献記録",
    "7_疑わしい文献記録": translations[lang]?.legend_doubtful_literature || "疑わしい記録"
  };

  const popupContents = filteredData.map(row => {
    if (!row.latitude || !row.longitude) return null;
    const { literatureName, literatureLink } = getLiteratureInfo(row.literatureID);
    const recordType = recordTypeMapping[row.recordType] || (translations[lang]?.unknown || "不明");
  
    let titleLine = (lang === "ja")
      ? `<strong>${row.japaneseName} ${row.scientificName}</strong><br>`
      : `<strong>${row.scientificName}</strong><br>`;
  
    let content = `
      ${titleLine}
      ${translations[lang]?.record_type || "記録の種類"}: ${recordType}<br>
    `;
  
    if (!row.literatureID || row.literatureID === "-") {
      content += translations[lang]?.unpublished_data || "未公表データ Unpublished Data";
    } else {
      content += `
        ${translations[lang]?.original_japanese_name || "文献中の和名"}: ${row.originalJapaneseName || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.original_scientific_name || "文献中の学名"}: ${row.originalScientificName || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.page || "ページ"}: ${row.page || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.location || "場所"}: ${row.location || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.population || "個体数"}: ${row.population || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.collection_date || "採集日"}: ${row.date || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.collector_jp || "採集者"}: ${row.collectorJp || (translations[lang]?.unknown || "不明")}<br>
        ${translations[lang]?.collector_en || "collector"}: ${row.collectorEn || (translations[lang]?.unknown || "不明")}<br><br>
      `;
  
      // 備考が "-" または空欄でない場合のみ追加
      if (row.note && row.note !== "-") {
        content += `${translations[lang]?.note_en || "備考"}: ${row.note}<br><br>`;
      }
  
      content += `${translations[lang]?.literature || "文献"}: ${literatureName} ${
        literatureLink ? `<a href="${literatureLink}" target="_blank">${literatureLink}</a>` : ""
      }<br><br>`;
  
      if (row.registrant && row.registrationDate) {
        const entryText = translations[lang]?.entered_by_on
          ?.replace("{name}", row.registrant)
          ?.replace("{date}", row.registrationDate);
        content += `${entryText}`;
      } else {
        content += `${translations[lang]?.entry || "記入"}: ${row.registrant || "-"}, ${row.registrationDate || "-"}`;
      }
    }
  
    return { row, popupContent: content };
  }).filter(i => i !== null);
  
  return { popupContents };
};

// ==================== グラフ系 ====================
// ---- ECharts helpers (bar width/gap fixed by dynamically resizing chart DOM width) ----
const ECHART_CFG = {
  month: {
    bar: 18,
    gap: 8,
    // legend が重ならないように、上側に少し余裕を持たせる
    grid: { left: 55, right: 45, top: 60, bottom: 45 }
  },
  pref: {
    bar: 20,
    gap: 8,
    grid: { left: 70, right: 260, top: 40, bottom: 120 }
  },
  year: {
    bar: 14,
    gap: 8,
    grid: { left: 70, right: 90, top: 70, bottom: 80 }
  }
};

function setEChartDomWidth(domId, itemCount, cfg) {
  const el = document.getElementById(domId);
  if (!el) return;

  const n = Math.max(1, itemCount || 0);
  const band = cfg.bar + cfg.gap;

  // ECharts chart width = grid.left + grid.right + (band * n)
  const w = cfg.grid.left + cfg.grid.right + band * n;

  el.style.width = `${w}px`;
}

function getOrInitEChart(domId, existingInstance) {
  const el = document.getElementById(domId);
  if (!el || typeof echarts === "undefined") return null;

  // If DOM was replaced, old instance must be disposed
  const current = echarts.getInstanceByDom(el);
  if (current && existingInstance && current !== existingInstance) {
    try { existingInstance.dispose(); } catch (e) {}
  }

  if (existingInstance && !existingInstance.isDisposed()) return existingInstance;

  if (current) return current;

  return echarts.init(el, null, { renderer: "canvas" });
}

function safeDisposeEChart(instance) {
  if (!instance) return;
  try { instance.dispose(); } catch (e) {}
}

function generateMonthlyChart(allRows) {
  const monthTitleEl = document.getElementById("month-chart-title");
  if (monthTitleEl) {
    monthTitleEl.textContent = translations[lang]?.monthly_occurrence || "出現期";
  }

  // 12 months: store unique keys to avoid double-counts
  const monthlySetAdult = Array.from({ length: 12 }, () => new Set());
  const monthlySetJuvenile = Array.from({ length: 12 }, () => new Set());

  allRows.forEach(row => {
    const m = parseInt(row.collectionMonth, 10);
    if (m >= 1 && m <= 12 && row.latitude && row.longitude) {
      const key = `${row.latitude},${row.longitude},${row.scientificName},${row.adultPresence}`;
      if (row.adultPresence?.toLowerCase() === "yes") {
        monthlySetAdult[m - 1].add(key);
      } else {
        monthlySetJuvenile[m - 1].add(key);
      }
    }
  });

  const labels = ["1","2","3","4","5","6","7","8","9","10","11","12"];
  const adult = monthlySetAdult.map(s => s.size);
  const juvenile = monthlySetJuvenile.map(s => s.size);

  // Fixed bar width/gap by sizing DOM width to category count
  setEChartDomWidth("month-chart", labels.length, ECHART_CFG.month);

  // Init / update chart
  monthChart = getOrInitEChart("month-chart", monthChart);
  if (!monthChart) return;

  const option = {
    animation: false,
    grid: { ...ECHART_CFG.month.grid, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    // 項目が少ない/多い場合でも崩れにくい legend
    legend: {
      type: "scroll",
      orient: "horizontal",
      top: 8,
      left: 10,
      right: 10,
      itemGap: 12
    },
    xAxis: {
      type: "category",
      name: translations[lang]?.month || "月",
      nameLocation: "end",
      nameGap: 22,
      data: labels,
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: "value",
      name: translations[lang]?.number_of_records || "記録数",
      minInterval: 1
    },
    series: [
      {
        name: translations[lang]?.adult || "成体",
        type: "bar",
        stack: "monthly",
        barWidth: ECHART_CFG.month.bar,
        data: adult
      },
      {
        name: translations[lang]?.juvenile_unknown || "幼体・不明",
        type: "bar",
        stack: "monthly",
        barWidth: ECHART_CFG.month.bar,
        data: juvenile
      }
    ]
  };

  monthChart.setOption(option, true);
  monthChart.resize();
}

function generatePrefectureChart(allRows) {
  const prefTitleEl = document.getElementById("prefecture-chart-title");

  if (prefTitleEl) {
    let chartTitle;
    if (lang === "ja") {
      const titleHead = translations[lang]?.prefecture_chart_title_head || "各都道府県の";
      const classificationText = (currentClassification === "order")
        ? translations[lang]?.chart_by_order || "目別"
        : translations[lang]?.chart_by_family || "科別";
      const unit = (currentChartMode === "count")
        ? translations[lang]?.chart_species || "種数"
        : (currentChartMode === "record")
          ? translations[lang]?.chart_records || "記録数"
          : translations[lang]?.chart_ratio || "割合";
      chartTitle = `${titleHead}${classificationText}${unit}`;
    } else {
      const classificationTextEn = (currentClassification === "order") ? "by Order" : "by Family";
      const unitEn = (currentChartMode === "count") ? "Number of Species"
                     : (currentChartMode === "record") ? "Number of Records"
                     : "Ratio";
      chartTitle = `${unitEn} in Each Prefecture (${classificationTextEn})`;
    }
    prefTitleEl.textContent = chartTitle;
  }

  // ====== Data aggregation (same as before) ======
  const chartMode = currentChartMode;         // "count" / "record" / "ratio"
  const classificationKey = currentClassification; // "order" / "family"

  const targetRows = allRows.filter(r => r.prefecture && r.prefecture !== "-");

  const prefectureTaxonMap = {};   // {pref: {taxon: Set(species)}}
  const prefectureRecordMap = {};  // {pref: {taxon: number}}
  const taxonSource = {};          // keep taxon keys per prefecture

  function getNormalizedSpeciesName(row) {
    const sciName = row.scientificName || "";
    if (row.subspecies && row.subspecies !== "-") {
      return `${sciName} ${row.subspecies}`;
    }
    if (lang !== "ja") {
      const parts = sciName.split(/\s+/);
      return parts.length >= 2 ? parts[0] + " " + parts[1] : sciName;
    }
    return sciName;
  }

  targetRows.forEach(row => {
    const pref = row.prefecture;
    const keyValue = (classificationKey === "order") ? row.order : row.family;
    if (!pref || pref === "-" || !keyValue || keyValue === "-") return;

    const nm = getNormalizedSpeciesName(row);

    if (!prefectureTaxonMap[pref]) prefectureTaxonMap[pref] = {};
    if (!prefectureTaxonMap[pref][keyValue]) prefectureTaxonMap[pref][keyValue] = new Set();
    prefectureTaxonMap[pref][keyValue].add(nm);

    if (!prefectureRecordMap[pref]) prefectureRecordMap[pref] = {};
    if (!prefectureRecordMap[pref][keyValue]) prefectureRecordMap[pref][keyValue] = 0;
    prefectureRecordMap[pref][keyValue]++;

    if (!taxonSource[pref]) taxonSource[pref] = {};
    taxonSource[pref][keyValue] = true;
  });

  // Prefecture order list (JP)
  const prefectureOrder = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県",
    "岐阜県","静岡県","愛知県","三重県",
    "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
    "鳥取県","島根県","岡山県","広島県","山口県",
    "徳島県","香川県","愛媛県","高知県",
    "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県",
    "沖縄県"
  ];

  // Determine prefecture list to display
  let sortedPrefectures = [];
  if (chartMode === "count" || chartMode === "record") {
    const arr = prefectureOrder
      .filter(p => !!prefectureTaxonMap[p])
      .map(p => {
        const total = Object.values(prefectureTaxonMap[p] || {}).reduce((sum, set) => sum + set.size, 0);
        return { pref: p, total };
      })
      .sort((a, b) => b.total - a.total);
    sortedPrefectures = arr.map(i => i.pref);
  } else {
    sortedPrefectures = prefectureOrder.filter(p => !!prefectureTaxonMap[p]);
  }

  // Display label mapping
  let displayedPrefectures;
  if (lang !== "ja") {
    displayedPrefectures = sortedPrefectures.map(jpName => {
      const match = prefectureMeta.find(m => m.jp === jpName);
      return match ? match.en : jpName;
    });
  } else {
    displayedPrefectures = sortedPrefectures;
  }

  // Collect taxon keys
  const taxonSet = new Set();
  for (const pref in taxonSource) {
    for (const key in taxonSource[pref]) taxonSet.add(key);
  }
  const taxons = Array.from(taxonSet).sort();

  // Build per-taxon data (and abs counts for ratio tooltip)
  const datasets = taxons.map((taxon, index) => {
    const data = [];
    const absData = [];

    sortedPrefectures.forEach(pref => {
      const count = (chartMode === "record")
        ? (prefectureRecordMap[pref]?.[taxon] || 0)
        : (prefectureTaxonMap[pref]?.[taxon]?.size || 0);
      absData.push(count);

      if (chartMode === "ratio") {
        const total = Object.values(prefectureTaxonMap[pref] || {}).reduce((sum, set) => sum + set.size, 0);
        const ratio = total === 0 ? 0 : ((count / total) * 100).toFixed(1);
        data.push(parseFloat(ratio));
      } else {
        data.push(count);
      }
    });

    const colorPalette = [
      "rgba(255, 99, 132, 0.6)",
      "rgba(54, 162, 235, 0.6)",
      "rgba(255, 206, 86, 0.6)",
      "rgba(75, 192, 192, 0.6)",
      "rgba(153, 102, 255, 0.6)",
      "rgba(255, 159, 64, 0.6)",
      "rgba(199, 199, 199, 0.6)"
    ];

    return {
      label: taxon,
      data,
      _absData: absData,
      color: colorPalette[index % colorPalette.length]
    };
  });

  // ====== ECharts rendering ======
  // Fix bar width + gap by resizing the chart DOM width to match category count
  setEChartDomWidth("prefecture-chart", displayedPrefectures.length, ECHART_CFG.pref);

  prefectureChart = getOrInitEChart("prefecture-chart", prefectureChart);
  if (!prefectureChart) return;

  const unitText = (chartMode === "ratio")
    ? (translations[lang]?.chart_ratio || "割合")
    : (chartMode === "record")
      ? (translations[lang]?.chart_records || "記録数")
      : (translations[lang]?.chart_species || "種数");

  const xAxisName = translations[lang]?.prefecture || "都道府県";

  const series = datasets.map(d => {
    const data = (chartMode === "ratio")
      ? d.data.map((v, i) => ({ value: v, abs: d._absData[i] }))
      : d.data;
    return {
      name: (() => {
        const sci = d.label;
        const jap = taxonMap[sci]?.japaneseName || "-";
        return (lang === "ja") ? `${sci} / ${jap}` : sci;
      })(),
      type: "bar",
      stack: "total",
      barWidth: ECHART_CFG.pref.bar,
      itemStyle: { color: d.color },
      emphasis: { focus: "series" },
      data
    };
  });

  const option = {
    animation: false,
    grid: { ...ECHART_CFG.pref.grid, containLabel: true },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 10,
      top: 40,
      bottom: 20
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: params => {
        if (!params || !params.length) return "";
        const axisLabel = params[0].axisValueLabel;
        const lines = [axisLabel];

        params.forEach(p => {
          const name = p.seriesName;
          const val = p.value;
          if (chartMode === "ratio") {
            const abs = (p.data && typeof p.data.abs !== "undefined") ? p.data.abs : "";
            lines.push(`${name}: ${val}% (${abs}${translations[lang]?.species_unit || "種"})`);
          } else {
            lines.push(`${name}: ${val}`);
          }
        });
        return lines.join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: xAxisName,
      data: displayedPrefectures,
      axisLabel: { interval: 0, rotate: 60 },
      axisTick: { alignWithLabel: true }
    },
    yAxis: [
      {
        type: "value",
        name: unitText,
        max: (chartMode === "ratio") ? 100 : undefined,
        axisLabel: { formatter: (chartMode === "ratio") ? "{value}%" : "{value}" }
      }
    ],
    series
  };

  prefectureChart.setOption(option, true);
  prefectureChart.resize();
}

function generateYearChart(rows, mode) {
  const yearChartTitleEl = document.getElementById("year-chart-title");
  if (yearChartTitleEl) {
    if (mode.startsWith("record")) {
      yearChartTitleEl.textContent =
        translations[lang]?.[
          mode.includes("collection")
            ? "year_chart_record_collection"
            : "year_chart_record_publication"
        ] || (mode.includes("collection")
          ? "記録数と累積記録数（採集年）"
          : "記録数と累積記録数（出版年）");
    } else {
      yearChartTitleEl.textContent =
        translations[lang]?.[
          mode.includes("collection")
            ? "year_chart_species_collection"
            : "year_chart_species_publication"
        ] || (mode.includes("collection")
          ? "種数と累積種数（採集年）"
          : "種数と累積種数（出版年）");
    }
  }

  const yearKey = mode.includes("collection") ? "collectionYear" : "publicationYear";

  // ---- recordType (1..7) definitions ----
  const typeDefs = [
    { id: 1, key: "year_type_1", fallback: "原記載", color: "#1f77b4" },
    { id: 2, key: "year_type_2", fallback: "統合された種の原記載", color: "#9467bd" },
    { id: 3, key: "year_type_3", fallback: "疑わしいタイプ", color: "#ffb6c1", borderColor: "#000", borderWidth: 1 },
    { id: 4, key: "year_type_4", fallback: "疑わしい統合された種のタイプ", color: "#ff99c8", borderColor: "#000", borderWidth: 1 },
    { id: 5, key: "year_type_5", fallback: "標本記録", color: "#d62728" },
    // White fill + red border (match the marker style)
    { id: 6, key: "year_type_6", fallback: "文献記録", color: "#ffffff", borderColor: "#d62728", borderWidth: 2 },
    { id: 7, key: "year_type_7", fallback: "疑わしい文献記録", color: "#ffb6c1", borderColor: "#000", borderWidth: 1 }
  ];

  // Raw aggregation
  const yearData = {};              // {year: {typeId: count}}
  const speciesByYearByType = {};   // {year: {typeId: Set(species)}}

  rows.forEach(row => {
    const year = parseInt(row[yearKey], 10);
    const species = row.scientificName;
    const typeId = parseInt(String(row.recordType || "").split("_")[0], 10);

    if (!Number.isInteger(year) || !Number.isInteger(typeId) || !species || species === "-") return;

    if (mode.startsWith("record")) {
      if (!yearData[year]) yearData[year] = {};
      yearData[year][typeId] = (yearData[year][typeId] || 0) + 1;
    } else {
      if (!speciesByYearByType[year]) speciesByYearByType[year] = {};
      if (!speciesByYearByType[year][typeId]) speciesByYearByType[year][typeId] = new Set();
      speciesByYearByType[year][typeId].add(species);
    }
  });

  const allYears = Object.keys(mode.startsWith("record") ? yearData : speciesByYearByType).map(y => parseInt(y, 10));
  if (allYears.length === 0) {
    safeDisposeEChart(yearChart);
    yearChart = null;
    return;
  }

  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);

  // Fill missing years so the timeline is continuous
  const sortedYears = [];
  for (let y = minYear; y <= maxYear; y++) sortedYears.push(y);

  // Build bar series (only types that actually have data)
  const barSeries = [];
  const activeTypeIds = [];

  typeDefs.forEach(def => {
    const label = translations[lang]?.[def.key] || def.fallback;

    const data = sortedYears.map(year => {
      if (mode.startsWith("record")) {
        return yearData[year]?.[def.id] || 0;
      }
      return speciesByYearByType[year]?.[def.id]?.size || 0;
    });

    const total = data.reduce((a, b) => a + b, 0);
    if (total <= 0) return;

    activeTypeIds.push(def.id);

    const itemStyle = { color: def.color };
    if (def.borderColor) itemStyle.borderColor = def.borderColor;
    if (def.borderWidth) itemStyle.borderWidth = def.borderWidth;

    barSeries.push({
      name: label,
      type: "bar",
      stack: "stack1",
      barWidth: ECHART_CFG.year.bar,
      itemStyle,
      emphasis: { focus: "series" },
      data
    });
  });

  // Cumulative line (based on the visible types)
  const cumulativeLabel = mode.startsWith("record")
    ? (translations[lang]?.year_chart_y2_label_record || "累積記録数")
    : (translations[lang]?.year_chart_y2_label_species || "累積種数");

  const cumulativeArray = [];
  if (mode.startsWith("record")) {
    let cumulativeSum = 0;
    for (const year of sortedYears) {
      const total = activeTypeIds.reduce((sum, t) => sum + (yearData[year]?.[t] || 0), 0);
      cumulativeSum += total;
      cumulativeArray.push(cumulativeSum);
    }
  } else {
    const cumulativeSet = new Set();
    for (const year of sortedYears) {
      activeTypeIds.forEach(t => {
        const setObj = speciesByYearByType[year]?.[t];
        if (setObj && setObj.forEach) setObj.forEach(v => cumulativeSet.add(v));
      });
      cumulativeArray.push(cumulativeSet.size);
    }
  }

  const lineSeries = {
    name: cumulativeLabel,
    type: "line",
    yAxisIndex: 1,
    showSymbol: false,
    smooth: false,
    lineStyle: { width: 2, color: "#000" },
    itemStyle: { color: "#000" },
    data: cumulativeArray
  };

  const leftAxisLabel =
    translations[lang]?.[
      mode.startsWith("species") ? "year_chart_y_label_species" : "year_chart_y_label_record"
    ] || (mode.startsWith("species") ? "種数" : "記録数");

  const rightAxisLabel =
    translations[lang]?.[
      mode.startsWith("species") ? "year_chart_y2_label_species" : "year_chart_y2_label_record"
    ] || (mode.startsWith("species") ? "累積種数" : "累積記録数");

  // Fix bar width + gap by resizing the chart DOM width to match category count
  setEChartDomWidth("year-chart", sortedYears.length, ECHART_CFG.year);

  yearChart = getOrInitEChart("year-chart", yearChart);
  if (!yearChart) return;

  const option = {
    animation: false,
    grid: { ...ECHART_CFG.year.grid, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { type: "scroll", top: 10 },
    xAxis: {
      type: "category",
      data: sortedYears.map(String),
      axisTick: { alignWithLabel: true },
      axisLabel: {
        interval: 0,
        rotate: 45,
        hideOverlap: true
      }
    },
    yAxis: [
      { type: "value", name: leftAxisLabel, minInterval: 1 },
      { type: "value", name: rightAxisLabel, minInterval: 1 }
    ],
    series: [...barSeries, lineSeries]
  };

  yearChart.setOption(option, true);
  yearChart.resize();
}

// ==================== UI補助 ====================
// フィルター有効・無効を切り替える関数
function updateFilterActivationUI() {
  const setupFilterToggle = (checkboxId, containerId, sliderId = null) => {
    const checkbox = document.getElementById(checkboxId);
    const container = document.getElementById(containerId);
    if (!checkbox || !container) return;

    const enabled = checkbox.checked;

    // label以外の子要素（スライダーやinput）に処理を適用
    const isCollectionMonthToggle = (checkboxId === "filter-collection-month-active");

    container.querySelectorAll(":scope > *:not(label)").forEach(child => {
      // 採集月フィルタはOFFでも各月(＋不明)を操作できるようにし、見た目もグレーアウトしない
      child.classList.toggle("filter-body-disabled", (!enabled && !isCollectionMonthToggle));

      // input, select, button を無効化
      // 採集月は「OFF後に特定の月を選べる」ように、月チェックは常に操作可能にする
      child.querySelectorAll("input, select, button").forEach(ctrl => {
        if (isCollectionMonthToggle) {
          ctrl.disabled = false;
          // もしCSSで pointer-events が無効化されていても操作できるようにする
          child.style.pointerEvents = "auto";
        } else {
          ctrl.disabled = !enabled;
          child.style.pointerEvents = "";
        }
      });
    });

    // jQuery UI スライダーの有効/無効切り替え
    if (sliderId && $(`#${sliderId}`).hasClass("ui-slider")) {
      $(`#${sliderId}`).slider("option", "disabled", !enabled);
    }
  };

  setupFilterToggle("filter-publication-year-active", "publication-year-container", "publication-year-slider");
  setupFilterToggle("filter-collection-year-active", "collection-year-container", "collection-year-slider");
  setupFilterToggle("filter-biennial-active", "biennial-container");
  setupFilterToggle("filter-collection-month-active", "month-container");
  setupFilterToggle("filter-life-stage-active", "life-stage-container");
}

function updateRecordInfo(recordCount, locationCount) {
  const container = document.getElementById("selected-labels");
  if (!container) return;

  // 件数情報を多言語対応で構築
  const recordLabel = translations[lang]?.records || "レコード数";
  const locationLabel = translations[lang]?.locations || "地点数";

  // 既存のカウント情報があれば削除（再描画のため）
  const old = document.getElementById("record-info-wrapper");
  if (old) old.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "record-info-wrapper";
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "flex-end";
  wrapper.style.gap = "1em";
  wrapper.style.fontWeight = "normal";
  wrapper.style.fontSize = "90%";
  wrapper.style.marginTop = "0.3em";

  wrapper.innerHTML = `
    <div>${recordLabel}: <span id="record-count">${recordCount}</span></div>
    <div>${locationLabel}: <span id="location-count">${locationCount}</span></div>
  `;

  container.appendChild(wrapper);
  container.style.display = "block";
}

function updateSelectedLabels() {
  const labelContainer = document.getElementById("selected-labels");
  if (!labelContainer) return;

  // サブピクセル精度で高さ計測
  const previousRect = labelContainer.getBoundingClientRect();
  const previousHeight = previousRect.height;

  const selectIds = [
    "filter-order",
    "filter-family",
    "filter-genus",
    "filter-species",
    "filter-prefecture",
    "filter-island",
    "filter-literature"
  ];

  const labels = selectIds.map(id => {
    const sel = document.getElementById(id);
    if (!sel) return "";
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return "";

    let labelText = opt.text;
    
    // -----------------------------
    // 1) (目/科/属/種) → "和名 / 学名" に直す
    // -----------------------------
    if (["filter-order","filter-family","filter-genus","filter-species"].includes(id)) {
      if (labelText.includes(" / ")) {
        const parts = labelText.split(" / ");
        const left = parts[0].trim();
        const right = parts[1].trim();

        // 学名判定の簡易ルール
        const isLeftLikelySci = /[a-zA-Z]/.test(left);

        let jName, sName; 
        if (isLeftLikelySci) {
          // 左:学名, 右:和名
          jName = right;
          sName = left;
        } else {
          // 左:和名, 右:学名
          jName = left;
          sName = right;
        }
        labelText = `${jName} / ${sName}`;
      }
    }

    // -----------------------------
    // 2) 都道府県・島 → 日本語UIなら日本語のみ, 英語UIなら英語のみ
    // -----------------------------
    if (id === "filter-prefecture" || id === "filter-island") {
      if (labelText.includes(" / ")) {
        const [enPart, jaPart] = labelText.split(" / ");
        labelText = (lang === "ja") ? jaPart : enPart;
      }
    }

    // -----------------------------
    // 3) 文献 → getLiteratureInfo() で取得
    // -----------------------------
    if (id === "filter-literature") {
      const litID = opt.value;
      const { literatureName, literatureLink } = getLiteratureInfo(litID);
      return literatureLink
        ? `${literatureName} <a href="${literatureLink}" target="_blank">${literatureLink}</a>`
        : literatureName;
    }

    // -----------------------------
    // 4) format関数で 目/科/属/種 → 斜体化 + 著者年付与
    // -----------------------------
    if (id === "filter-order") {
      labelText = formatOrderFamilyName(labelText);
    } else if (id === "filter-family") {
      labelText = formatOrderFamilyName(labelText);
    } else if (id === "filter-genus") {
      labelText = formatGenusName(labelText);
    } else if (id === "filter-species") {
      labelText = formatSpeciesName(labelText);
    }

    // -----------------------------
    // 5) 英語UIなら「和名 /」部分を除去
    // -----------------------------
    if (lang !== "ja") {
      labelText = labelText.replace(/^.*?\/\s*/, "");
    }

    // -----------------------------
    // 6) 記号のエンコード（不要なら削除）
    // -----------------------------
    labelText = labelText
      .replace(/-/g, "&#8209;")
      .replace(/\[/g, "&#91;")
      .replace(/\]/g, "&#93;");

    return labelText;
  }).filter(x => x);

  /****************************************
   * 7) 年・隔年発生・採集月・ライフステージの追加ラベル
   ****************************************/

  // 出版年
  if ($("#filter-publication-year-active").is(":checked")) {
    const min = $("#publication-year-min").val();
    const max = $("#publication-year-max").val();
    if (min && max) {
      if (lang === "ja") {
        labels.push(`${min}〜${max}年に出版`);
      } else {
        // "Published from X to Y" など、お好みで
        labels.push(`Published between ${min} and ${max}`);
      }
    }
  }

  // 採集年
  if ($("#filter-collection-year-active").is(":checked")) {
    const min = $("#collection-year-min").val();
    const max = $("#collection-year-max").val();
    if (min && max) {
      if (lang === "ja") {
        labels.push(`${min}〜${max}年に採集`);
      } else {
        labels.push(`Collected between ${min} and ${max}`);
      }
    }
  }

  // 隔年発生 (周期)
  if ($("#filter-biennial-active").is(":checked")) {
    const target = $("#biennial-target-year").val();
    const interval = $("#biennial-interval").val();
    if (target && interval) {
      if (lang === "ja") {
        labels.push(`${target}年を含む${interval}年周期`);
      } else {
        labels.push(`Records every ${interval} years, including ${target}`);
      }
    }
  }

  // 採集月（出現期）
  if ($("#filter-collection-month-active").is(":checked")) {
    const selectedMonthValues = $(".collection-month:checked").map(function () {
      return String(this.value);
    }).get();

    if (selectedMonthValues.length > 0) {
      const monthKeyMap = {
        "1": "january",
        "2": "february",
        "3": "march",
        "4": "april",
        "5": "may",
        "6": "june",
        "7": "july",
        "8": "august",
        "9": "september",
        "10": "october",
        "11": "november",
        "12": "december"
      };

      const monthLabels = selectedMonthValues.map(v => {
        if (v === "unknown") return getTranslation(lang, "unknown") || "不明";
        const key = monthKeyMap[v];
        return key ? (getTranslation(lang, key) || v) : v;
      });

      if (lang === "ja") {
        labels.push(`採集月：${monthLabels.join(", ")}`);
      } else {
        labels.push(`Month(s): ${monthLabels.join(", ")}`);
      }
    }
  }

  // ライフステージ
  if ($("#filter-life-stage-active").is(":checked")) {
    const selectedStages = $(".life-stage:checked").map(function () {
      // 日本語UIなら「成体 / 幼体・不明」 英語UIなら "Adult / Juvenile or Unknown" など
      if (this.value === "yes") {
        return (lang === "ja") ? "成体" : "Adult";
      } else {
        return (lang === "ja") ? "幼体・不明" : "Juvenile / Unknown";
      }
    }).get();
    if (selectedStages.length > 0) {
      if (lang === "ja") {
        labels.push(`ライフステージ：${selectedStages.join(", ")}`);
      } else {
        labels.push(`Life stage(s): ${selectedStages.join(", ")}`);
      }
    }
  }

  // -----------------------------
  // 8) ラベル一覧を画面に反映
  // -----------------------------
  if (labels.length > 0) {
    labelContainer.innerHTML = labels.join("<br>");
    labelContainer.style.display = "block";
  } else {
    labelContainer.innerHTML = "";
    labelContainer.style.display = "none";
  }

  updateRecordInfo(
    filteredRows.length,
    new Set(filteredRows.map(r => `${r.latitude},${r.longitude}`)).size
  );

  // 高さ変動のスクロール補正（サブピクセル対応）
  const newRect = labelContainer.getBoundingClientRect();
  const newHeight = newRect.height;
  const diff = newHeight - previousHeight;
  if (window.innerWidth > 711 && diff !== 0) {
    window.scrollTo({ top: window.scrollY + diff, behavior: "instant" });
  }
}

const formatOrderFamilyName = (name) => {
  if (!name.includes(" / ")) return name;
  const [jName, sciName] = name.split(" / ");
  const taxonInfo = taxonMap[sciName] || { japaneseName: "-", authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;
  return `${taxonInfo.japaneseName} / <span class="non-italic">${sciName}</span>${authorYear}`;
};

const formatGenusName = (name) => {
  if (!name.includes(" / ")) return name;
  const [jName, sciName] = name.split(" / ");
  const taxonInfo = taxonMap[sciName] || { japaneseName: "-", authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;
  return `${taxonInfo.japaneseName} / <i>${sciName}</i>${authorYear}`;
};

const formatSpeciesName = (name) => {
  if (!name.includes(" / ")) return name;

  let [jName, sciName] = name.split(" / ");
  const cleanSciName = sciName.replace(/<\/?i>/g, "").trim();
  const taxonInfo = taxonMap[cleanSciName] || { authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;

  // 括弧を非斜体に置換
  let sciFormatted = sciName
    .replace(/\(/g, '<span class="non-italic">(</span>')
    .replace(/\)/g, '<span class="non-italic">)</span>');

  // ord., fam., gen. が含まれている場合は全体を非斜体
  if (/\bord\.|\bfam\.|\bgen\./.test(sciFormatted)) {
    return `${jName} / <span class="non-italic">${sciFormatted}</span>${authorYear}`;
  }

  // sp. を含む場合は sp. 以降を非斜体に
  if (/ sp\./.test(sciFormatted)) {
    const [beforeSp, afterSp] = sciFormatted.split(/ sp\./, 2);
    const italicPart = beforeSp.trim().split(/\s+/).map(word => {
      if (["cf.", "aff."].includes(word)) {
        return `<span class="non-italic">${word}</span>`;
      }
      return `<i>${word}</i>`;
    }).join(" ");
    const nonItalicSp = `<span class="non-italic"> sp.${afterSp ? afterSp : ""}</span>`;
    return `${jName} / ${italicPart} ${nonItalicSp}${authorYear}`;
  }

  // 通常パターン：cf.やaff.のみ非斜体、それ以外は斜体
  const formattedParts = sciFormatted.split(/\s+/).map(part => {
    return ["cf.", "aff."].includes(part)
      ? `<span class="non-italic">${part}</span>`
      : `<i>${part}</i>`;
  });

  return `${jName} / ${formattedParts.join(" ")}${authorYear}`;
};

function linkMasterAndDubiousCheckboxes() {
  const masterCheckbox = document.getElementById("legend-master-checkbox");
  const filterDoubtfulType = document.getElementById("filter-doubtful-type");
  const filterDoubtfulIntegrated = document.getElementById("filter-doubtful-synonymized-type");
  const filterDoubtfulLiterature = document.getElementById("filter-doubtful-literature");
  const excludeDubious = document.getElementById("exclude-dubious");
  if (!masterCheckbox || !filterDoubtfulType || !filterDoubtfulIntegrated || !filterDoubtfulLiterature || !excludeDubious) {
    console.warn("疑わしい系チェックボックスが見つかりません");
    return;
  }

  function areAllDubiousOff() {
    return (
      !filterDoubtfulType.checked &&
      !filterDoubtfulIntegrated.checked &&
      !filterDoubtfulLiterature.checked
    );
  }
  function areAnyDubiousOn() {
    return (
      filterDoubtfulType.checked ||
      filterDoubtfulIntegrated.checked ||
      filterDoubtfulLiterature.checked
    );
  }

  excludeDubious.addEventListener("change", () => {
    if (excludeDubious.checked) {
      filterDoubtfulType.checked = false;
      filterDoubtfulIntegrated.checked = false;
      filterDoubtfulLiterature.checked = false;
    } else {
      filterDoubtfulType.checked = true;
      filterDoubtfulIntegrated.checked = true;
      filterDoubtfulLiterature.checked = true;
    }
    applyFilters();
    updateURL();
  });

  const onDubiousChange = () => {
    if (areAnyDubiousOn()) {
      excludeDubious.checked = false;
    } else {
      excludeDubious.checked = true;
    }
    applyFilters();
    updateURL();
  };
  filterDoubtfulType.addEventListener("change", onDubiousChange);
  filterDoubtfulIntegrated.addEventListener("change", onDubiousChange);
  filterDoubtfulLiterature.addEventListener("change", onDubiousChange);

  masterCheckbox.addEventListener("change", () => {
    const markerFilterCheckboxes = document.querySelectorAll(".marker-filter-checkbox");
    markerFilterCheckboxes.forEach(cb => {
      cb.checked = masterCheckbox.checked;
    });
    if (areAllDubiousOff()) {
      excludeDubious.checked = true;
    } else {
      excludeDubious.checked = false;
    }
    applyFilters();
    updateURL();
  });

  if (areAllDubiousOff()) {
    excludeDubious.checked = true;
  } else {
    excludeDubious.checked = false;
  }
}

function setupClassificationRadio() {
  const classRadios = document.querySelectorAll('input[name="classification"]');
  classRadios.forEach(r => {
    r.addEventListener("change", e => {
      currentClassification = e.target.value;
      generatePrefectureChart(filteredRows);
    });
  });

  const modeRadios = document.querySelectorAll('input[name="chart-mode"]');
  modeRadios.forEach(r => {
    r.addEventListener("change", e => {
      currentChartMode = e.target.value;
      generatePrefectureChart(filteredRows);
    });
  });
}

// チェックボックスやセレクトボックスの初期値を設定
const DEFAULT_STATE = {
  // --- フィルター有効・無効スイッチ類 ---
  filterPublicationYearActive: false,
  filterCollectionYearActive: false,
  filterBiennialActive: false,
  filterCollectionMonthActive: false,
  filterLifeStageActive: false,

  // --- 月チェックボックス（1～12 + 不明） ---
  // 以前はすべて checked だった場合は true, すべて外したいなら false
  collectionMonths: [false, false, false, false, false, false, false, false, false, false, false, false, false],

  // --- ライフステージチェックボックス ---
  lifeStages: {
    yes: true,
    no: true
  },

  // --- 除外系チェックボックス ---
  excludeUnpublished: false,
  excludeDubious: true,      // 以前HTMLでチェックされていた
  excludeCitation: true,     // 以前HTMLでチェックされていた
  excludeUndescribed: false,
  excludeUnspecies: false,

  // --- レジェンド関連 ---
  legendMasterCheckbox: true,              // 以前は checked
  filterType: true,
  filterSynonymizedType: true,
  filterDoubtfulType: false,
  filterDoubtfulSynonymizedType: false,
  filterSpecimen: true,
  filterLiteratureRecord: true,
  filterDoubtfulLiterature: false,

  // --- ラジオボタン ---
  classification: "order",       // name="classification"
  chartMode: "count",            // name="chart-mode"
  yearMode: "publication",       // name="year-mode"
  countMode: "record",

  // --- トグルチェックボックス ---
  toggleHigherTaxonomy: true,    // id="toggle-higher-taxonomy"

  // --- セレクトボックス ---
  filterOrder: "",
  filterFamily: "",
  filterGenus: "",
  filterSpecies: "",
  filterPrefecture: "",
  filterIsland: "",
  filterLiterature: "",

  // --- 隔年発生用 ---
  biennialTargetYear: "",
  biennialInterval: ""
};

//初期値を反映する関数
function applyDefaultState() {
  // 1. チェックボックス類 (フィルター有効/無効スイッチ)
  document.getElementById("filter-publication-year-active").checked = DEFAULT_STATE.filterPublicationYearActive;
  document.getElementById("filter-collection-year-active").checked = DEFAULT_STATE.filterCollectionYearActive;
  document.getElementById("filter-biennial-active").checked = DEFAULT_STATE.filterBiennialActive;
  document.getElementById("filter-collection-month-active").checked = DEFAULT_STATE.filterCollectionMonthActive;
  document.getElementById("filter-life-stage-active").checked = DEFAULT_STATE.filterLifeStageActive;

  // 2. 月ごとのチェックボックス（1〜12 + 不明）
  const monthCheckboxes = document.querySelectorAll(".collection-month");
  // 13個ある想定; i=0 -> 1月, i=1 -> 2月, ... i=11 -> 12月, i=12 -> 不明
  monthCheckboxes.forEach((cb, i) => {
    cb.checked = (DEFAULT_STATE.collectionMonths[i] ?? false);
  });

  // 3. ライフステージ
  //    .life-stage (2個: value="yes", value="no"など) を想定
  const lifeStageCheckboxes = document.querySelectorAll(".life-stage");
  lifeStageCheckboxes.forEach(cb => {
    if (cb.value === "yes") {
      cb.checked = DEFAULT_STATE.lifeStages.yes;
    } else if (cb.value === "no") {
      cb.checked = DEFAULT_STATE.lifeStages.no;
    }
  });

  // 4. 除外系チェック
  document.getElementById("exclude-unpublished").checked = DEFAULT_STATE.excludeUnpublished;
  document.getElementById("exclude-dubious").checked = DEFAULT_STATE.excludeDubious;
  document.getElementById("exclude-citation").checked = DEFAULT_STATE.excludeCitation;
  document.getElementById("exclude-undescribed").checked = DEFAULT_STATE.excludeUndescribed;
  document.getElementById("exclude-unspecies").checked = DEFAULT_STATE.excludeUnspecies;

  // 5. レジェンド関連
  document.getElementById("legend-master-checkbox").checked = DEFAULT_STATE.legendMasterCheckbox;
  document.getElementById("filter-type").checked = DEFAULT_STATE.filterType;
  document.getElementById("filter-synonymized-type").checked = DEFAULT_STATE.filterSynonymizedType;
  document.getElementById("filter-doubtful-type").checked = DEFAULT_STATE.filterDoubtfulType;
  document.getElementById("filter-doubtful-synonymized-type").checked = DEFAULT_STATE.filterDoubtfulSynonymizedType;
  document.getElementById("filter-specimen").checked = DEFAULT_STATE.filterSpecimen;
  document.getElementById("filter-literature-record").checked = DEFAULT_STATE.filterLiteratureRecord;
  document.getElementById("filter-doubtful-literature").checked = DEFAULT_STATE.filterDoubtfulLiterature;

  // 6. ラジオボタン
  //    <input type="radio" name="classification" value="order" /> など
  //    → querySelector で [value=...] を指定して、.checked = true
  const classificationRadio = document.querySelector(`input[name="classification"][value="${DEFAULT_STATE.classification}"]`);
  if (classificationRadio) classificationRadio.checked = true;

  const chartModeRadio = document.querySelector(`input[name="chart-mode"][value="${DEFAULT_STATE.chartMode}"]`);
  if (chartModeRadio) chartModeRadio.checked = true;

  const yearModeRadio = document.querySelector(`input[name="year-mode"][value="${DEFAULT_STATE.yearMode}"]`);
  if (yearModeRadio) yearModeRadio.checked = true;

  const countModeRadio = document.querySelector(`input[name="count-mode"][value="${state.countMode}"]`);
  if (countModeRadio) countModeRadio.checked = true;

  // 7. トグルチェック
  document.getElementById("toggle-higher-taxonomy").checked = DEFAULT_STATE.toggleHigherTaxonomy;

  // 8. セレクトボックス
  //    いずれも初期状態は "" (何も選択されていない)
  //    あるいは、初期選択したいものがあればここで指定
  document.getElementById("filter-order").value = DEFAULT_STATE.filterOrder;
  document.getElementById("filter-family").value = DEFAULT_STATE.filterFamily;
  document.getElementById("filter-genus").value = DEFAULT_STATE.filterGenus;
  document.getElementById("filter-species").value = DEFAULT_STATE.filterSpecies;
  document.getElementById("filter-prefecture").value = DEFAULT_STATE.filterPrefecture;
  document.getElementById("filter-island").value = DEFAULT_STATE.filterIsland;
  document.getElementById("filter-literature").value = DEFAULT_STATE.filterLiterature;

  // 9. 隔年発生
  document.getElementById("biennial-target-year").value = DEFAULT_STATE.biennialTargetYear;
  document.getElementById("biennial-interval").value = DEFAULT_STATE.biennialInterval;
}

// ==================== URL関連 ====================
function readStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const restoredState = JSON.parse(JSON.stringify(DEFAULT_STATE));

  // 各パラメータを state に反映
  ["publicationYearFrom", "publicationYearTo", "collectionYearFrom", "collectionYearTo", "biennialTargetYear", "biennialInterval"].forEach(key => {
    if (params.has(key)) restoredState[key] = params.get(key);
  });

  [
    "filterCollectionMonthActive", "filterLifeStageActive", "excludeUnpublished", "excludeDubious", "excludeCitation",
    "excludeUndescribed", "excludeUnspecies", "legendMasterCheckbox", "filterType", "filterSynonymizedType",
    "filterDoubtfulType", "filterDoubtfulSynonymizedType", "filterSpecimen", "filterLiteratureRecord",
    "filterDoubtfulLiterature", "toggleHigherTaxonomy"
  ].forEach(key => {
    if (params.has(key)) restoredState[key] = params.get(key) === "1";
  });

  ["classification", "chartMode", "yearMode", "countMode"].forEach(key => {
    if (params.has(key)) restoredState[key] = params.get(key);
  });

  ["filterOrder", "filterFamily", "filterGenus", "filterSpecies", "filterPrefecture", "filterIsland", "filterLiterature"].forEach(key => {
    if (params.has(key)) restoredState[key] = params.get(key);
  });

  if (params.has("collectionMonths")) {
    const m = params.get("collectionMonths") || "";

    // 旧仕様(12桁)にも対応
    if (m.length === 13) {
      for (let i = 0; i < 13; i++) {
        restoredState.collectionMonths[i] = m[i] === "1";
      }
    } else if (m.length === 12) {
      for (let i = 0; i < 12; i++) {
        restoredState.collectionMonths[i] = m[i] === "1";
      }
      restoredState.collectionMonths[12] = false; // 不明（13番目）
    }
  }

  return restoredState;
}

function applyStateToDOM(state) {
  // --- 1) チェックボックス類（フィルター有効/無効スイッチ） ---
  document.getElementById("filter-publication-year-active").checked = state.filterPublicationYearActive;
  document.getElementById("filter-collection-year-active").checked = state.filterCollectionYearActive;
  document.getElementById("filter-biennial-active").checked = state.filterBiennialActive;
  document.getElementById("filter-collection-month-active").checked = state.filterCollectionMonthActive;
  document.getElementById("filter-life-stage-active").checked = state.filterLifeStageActive;

  // --- ライフステージ選択のチェック ---
  if (state.selectedLifeStages?.includes("adult")) {
    document.getElementById("life-stage-adult").checked = true;
  }
  if (state.selectedLifeStages?.includes("juvenile_unknown")) {
    document.getElementById("life-stage-juvenile_unknown").checked = true;
  }

  // --- 2) チェックボックス類（除外系） ---
  document.getElementById("exclude-unpublished").checked = state.excludeUnpublished;
  document.getElementById("exclude-dubious").checked = state.excludeDubious;
  document.getElementById("exclude-citation").checked = state.excludeCitation;
  document.getElementById("exclude-undescribed").checked = state.excludeUndescribed;
  document.getElementById("exclude-unspecies").checked = state.excludeUnspecies;

  // --- 3) レジェンド関連のチェックボックス ---
  document.getElementById("legend-master-checkbox").checked = state.legendMasterCheckbox;
  document.getElementById("filter-type").checked = state.filterType;
  document.getElementById("filter-synonymized-type").checked = state.filterSynonymizedType;
  document.getElementById("filter-doubtful-type").checked = state.filterDoubtfulType;
  document.getElementById("filter-doubtful-synonymized-type").checked = state.filterDoubtfulSynonymizedType;
  document.getElementById("filter-specimen").checked = state.filterSpecimen;
  document.getElementById("filter-literature-record").checked = state.filterLiteratureRecord;
  document.getElementById("filter-doubtful-literature").checked = state.filterDoubtfulLiterature;

  // --- 4) 高次分類群の表示切替スイッチ ---
  document.getElementById("toggle-higher-taxonomy").checked = state.toggleHigherTaxonomy;

  // --- 5) ラジオボタン (classification, chart-mode, year-mode) ---
  const classificationRadio = document.querySelector(`input[name="classification"][value="${state.classification}"]`);
  if (classificationRadio) classificationRadio.checked = true;

  const chartModeRadio = document.querySelector(`input[name="chart-mode"][value="${state.chartMode}"]`);
  if (chartModeRadio) chartModeRadio.checked = true;

  const yearModeRadio = document.querySelector(`input[name="year-mode"][value="${state.yearMode}"]`);
  if (yearModeRadio) yearModeRadio.checked = true;

  const countModeRadio = document.querySelector(`input[name="count-mode"][value="${state.countMode}"]`);
  if (countModeRadio) countModeRadio.checked = true;

  // --- 6) 出版年 / 採集年のテキストボックス (スライダー用) ---
  //   文字列が入っている場合はテキストボックスに反映し、スライダーにも値を渡す
  if (typeof state.publicationYearFrom === "string") {
    document.getElementById("publication-year-min").value = state.publicationYearFrom;
  }
  if (typeof state.publicationYearTo === "string") {
    document.getElementById("publication-year-max").value = state.publicationYearTo;
  }
  if (typeof state.collectionYearFrom === "string") {
    document.getElementById("collection-year-min").value = state.collectionYearFrom;
  }
  if (typeof state.collectionYearTo === "string") {
    document.getElementById("collection-year-max").value = state.collectionYearTo;
  }

  // ▼ jQuery UI スライダーを使っているかチェック
  //   既に初期化されている場合のみ "values" を呼び出す
  if ($("#publication-year-slider").hasClass("ui-slider")) {
    const pubMin = parseInt(state.publicationYearFrom, 10);
    const pubMax = parseInt(state.publicationYearTo, 10);

    // 値が数値として有効ならスライダー更新
    if (!isNaN(pubMin) && !isNaN(pubMax)) {
      $("#publication-year-slider").slider("values", [ pubMin, pubMax ]);
    }
  }

  if ($("#collection-year-slider").hasClass("ui-slider")) {
    const colMin = parseInt(state.collectionYearFrom, 10);
    const colMax = parseInt(state.collectionYearTo, 10);

    if (!isNaN(colMin) && !isNaN(colMax)) {
      $("#collection-year-slider").slider("values", [ colMin, colMax ]);
    }
  }

  // --- 7) セレクトボックス (order, family, genus, species, prefecture, island, literature) ---
  document.getElementById("filter-order").value = state.filterOrder;
  document.getElementById("filter-family").value = state.filterFamily;
  document.getElementById("filter-genus").value = state.filterGenus;
  document.getElementById("filter-species").value = state.filterSpecies;
  document.getElementById("filter-prefecture").value = state.filterPrefecture;
  document.getElementById("filter-island").value = state.filterIsland;
  document.getElementById("filter-literature").value = state.filterLiterature;

  // --- 8) 隔年発生 (ターゲット年/周期) ---
  const targetYearEl = document.getElementById("biennial-target-year");
  const intervalEl = document.getElementById("biennial-interval");

  if (state.biennialTargetYear) {
    targetYearEl.value = state.biennialTargetYear;
  } else if (targetYearEl.options.length > 0) {
    targetYearEl.value = targetYearEl.options[0].value; // 最小値を自動選択
  }

  if (state.biennialInterval) {
    intervalEl.value = state.biennialInterval;
  } else {
    intervalEl.value = "2"; // デフォルトの周期
  }

  // --- 9) 月チェックボックス (.collection-month)（1〜12月 + 不明）
  const monthCheckboxes = document.querySelectorAll(".collection-month");
  monthCheckboxes.forEach((cb, i) => {
    cb.checked = !!state.collectionMonths[i];
  });

  // 採集月フィルターがOFFのときは、月チェックもすべてOFFにしておく
  if (!state.filterCollectionMonthActive) {
    monthCheckboxes.forEach(cb => {
      cb.checked = false;
    });
  }
}

function getCurrentStateFromDOM() {
  const monthCheckboxes = document.querySelectorAll(".collection-month");
  const collectionMonths = [];
  monthCheckboxes.forEach(cb => {
    collectionMonths.push(cb.checked);
  });

  // ラジオボタン
  const classificationRadio = document.querySelector('input[name="classification"]:checked');
  const chartModeRadio = document.querySelector('input[name="chart-mode"]:checked');
  const yearModeRadio = document.querySelector('input[name="year-mode"]:checked');

  return {
    // フィルター系スイッチ
    filterPublicationYearActive: document.getElementById("filter-publication-year-active").checked,
    filterCollectionYearActive: document.getElementById("filter-collection-year-active").checked,
    filterBiennialActive: document.getElementById("filter-biennial-active").checked,
    filterCollectionMonthActive: document.getElementById("filter-collection-month-active").checked,
    filterLifeStageActive: document.getElementById("filter-life-stage-active").checked,

    // 除外系
    excludeUnpublished: document.getElementById("exclude-unpublished").checked,
    excludeDubious: document.getElementById("exclude-dubious").checked,
    excludeCitation: document.getElementById("exclude-citation").checked,
    excludeUndescribed: document.getElementById("exclude-undescribed").checked,
    excludeUnspecies: document.getElementById("exclude-unspecies").checked,

    // レジェンド
    legendMasterCheckbox: document.getElementById("legend-master-checkbox").checked,
    filterType: document.getElementById("filter-type").checked,
    filterSynonymizedType: document.getElementById("filter-synonymized-type").checked,
    filterDoubtfulType: document.getElementById("filter-doubtful-type").checked,
    filterDoubtfulSynonymizedType: document.getElementById("filter-doubtful-synonymized-type").checked,
    filterSpecimen: document.getElementById("filter-specimen").checked,
    filterLiteratureRecord: document.getElementById("filter-literature-record").checked,
    filterDoubtfulLiterature: document.getElementById("filter-doubtful-literature").checked,

    // トグル
    toggleHigherTaxonomy: document.getElementById("toggle-higher-taxonomy").checked,

    // ラジオ
    classification: classificationRadio ? classificationRadio.value : "order",
    chartMode: chartModeRadio ? chartModeRadio.value : "count",
    yearMode: yearModeRadio ? yearModeRadio.value : "publication",
    countMode: document.querySelector('input[name="count-mode"]:checked')?.value || "record",

    // 出版年
    publicationYearFrom: document.getElementById("publication-year-min").value,
    publicationYearTo: document.getElementById("publication-year-max").value,

    // 採集年
    collectionYearFrom: document.getElementById("collection-year-min").value,
    collectionYearTo: document.getElementById("collection-year-max").value,

    // セレクト
    filterOrder: document.getElementById("filter-order").value,
    filterFamily: document.getElementById("filter-family").value,
    filterGenus: document.getElementById("filter-genus").value,
    filterSpecies: document.getElementById("filter-species").value,
    filterPrefecture: document.getElementById("filter-prefecture").value,
    filterIsland: document.getElementById("filter-island").value,
    filterLiterature: document.getElementById("filter-literature").value,

    // 隔年発生
    biennialTargetYear: document.getElementById("biennial-target-year").value,
    biennialInterval: document.getElementById("biennial-interval").value,

    // 月チェックボックス
    collectionMonths
  };
}

function updateURL() {
  const currentState = getCurrentStateFromDOM();
  const params = new URLSearchParams();

  // 出版年：チェックONかつ値ありのときのみ
  if (currentState.filterPublicationYearActive) {
    if (currentState.publicationYearFrom) {
      params.set("publicationYearFrom", currentState.publicationYearFrom);
    }
    if (currentState.publicationYearTo) {
      params.set("publicationYearTo", currentState.publicationYearTo);
    }
  }

  // 採集年：チェックONかつ値ありのときのみ
  if (currentState.filterCollectionYearActive) {
    if (currentState.collectionYearFrom) {
      params.set("collectionYearFrom", currentState.collectionYearFrom);
    }
    if (currentState.collectionYearTo) {
      params.set("collectionYearTo", currentState.collectionYearTo);
    }
  }

  // 隔年発生：チェックONかつ値ありのときのみ
  if (currentState.filterBiennialActive) {
    if (currentState.biennialTargetYear) {
      params.set("biennialTargetYear", currentState.biennialTargetYear);
    }
    if (currentState.biennialInterval) {
      params.set("biennialInterval", currentState.biennialInterval);
    }
  }

  // その他の true/false チェックボックス
  const boolParams = [
    "filterCollectionMonthActive",
    "filterLifeStageActive",
    "excludeUnpublished",
    "excludeDubious",
    "excludeCitation",
    "excludeUndescribed",
    "excludeUnspecies",
    "legendMasterCheckbox",
    "filterType",
    "filterSynonymizedType",
    "filterDoubtfulType",
    "filterDoubtfulSynonymizedType",
    "filterSpecimen",
    "filterLiteratureRecord",
    "filterDoubtfulLiterature",
    "toggleHigherTaxonomy"
  ];
  boolParams.forEach(key => {
    if (currentState[key] !== DEFAULT_STATE[key]) {
      params.set(key, currentState[key] ? "1" : "0");
    }
  });

  // ラジオボタン
  const radioParams = ["classification", "chartMode", "yearMode", "countMode"];
  radioParams.forEach(key => {
    if (currentState[key] !== DEFAULT_STATE[key]) {
      params.set(key, currentState[key]);
    }
  });

  // セレクトボックス
  const selectParams = [
    "filterOrder", "filterFamily", "filterGenus", "filterSpecies",
    "filterPrefecture", "filterIsland", "filterLiterature"
  ];
  selectParams.forEach(key => {
    if (currentState[key] !== DEFAULT_STATE[key]) {
      params.set(key, currentState[key]);
    }
  });

  // 月チェックボックス（13桁: 1〜12月 + 不明）
  const monthString = currentState.collectionMonths.map(v => (v ? "1" : "0")).join("");
  const defaultMonthString = DEFAULT_STATE.collectionMonths.map(v => (v ? "1" : "0")).join("");
  if (monthString !== defaultMonthString) {
    params.set("collectionMonths", monthString);
  }

  // ライフステージ（成体 / 幼体・不明）：チェックONのときのみ出力
  if (currentState.filterLifeStageActive) {
    if (document.getElementById("life-stage-adult").checked) {
      params.set("adult", "1");
    }
    if (document.getElementById("life-stage-juvenile_unknown").checked) {
      params.set("juvenile_unknown", "1");
    }
  }


// 矩形選択（BBox）: boxBounds があれば URL に保存
if (typeof boxBounds !== "undefined" && boxBounds) {
  const { west, south, east, north } = boxBounds;
  const bboxStr = [west, south, east, north].map(v => Number(v).toFixed(6)).join(",");
  params.set("bbox", bboxStr);
}

const queryString = params.toString();
  const newUrl = queryString ? `?${queryString}` : window.location.pathname;
  window.history.replaceState({}, "", newUrl);
}

// ==================== レスポンシブ調整 ====================
function updateYearChart() {
  const yearMode = document.querySelector('input[name="year-mode"]:checked')?.value || "publication";
  const countMode = document.querySelector('input[name="count-mode"]:checked')?.value || "record";

  const mode =
    countMode === "record"
      ? (yearMode === "collection" ? "record-collection" : "record")
      : (yearMode === "collection" ? "species-collection" : "species");

  generateYearChart(filteredRows, mode);
}

let preventResize = false;

const adjustSearchContainerAndLegend = () => {
  if (preventResize) return;

  // 入力中なら再配置をスキップ
  if (document.activeElement?.matches("input[type='text']")) return;

  const searchContainer = document.querySelector(".search-container");
  const mapContainer = document.getElementById("mapid");
  const legend = document.querySelector(".legend");
  const selectedLabels = document.getElementById("selected-labels");
  const toggleButton = document.getElementById("toggle-button");

  if (!searchContainer || !mapContainer || !legend || !selectedLabels || !toggleButton) return;

  if (window.innerWidth <= 711) {
    // モバイルレイアウト
    const parent = mapContainer.parentNode;
    parent.insertBefore(searchContainer, mapContainer);
    searchContainer.insertAdjacentElement("afterend", selectedLabels);

    if (legend.parentNode !== mapContainer.parentNode) {
      mapContainer.insertAdjacentElement("afterend", legend);
    }
  } else {
    // デスクトップレイアウト
    mapContainer.appendChild(searchContainer);
    mapContainer.appendChild(legend);
  }
};

function updatePrefectureListInTab() {
  const select = document.getElementById('filter-prefecture');
  const listContainer = document.getElementById('prefecture-list');
  listContainer.innerHTML = '';

  // 見出し（多言語対応）
  const heading = translations[lang]?.prefecture || "都道府県";
  listContainer.innerHTML = `<h3>${heading}</h3>`;

  Array.from(select.options).forEach(option => {
    if (option.value !== '') {
      const li = document.createElement('li');
      const jpName = option.value;
      const enName = prefectureMeta.find(m => m.jp === jpName)?.en || "-";

      // 言語に応じて表示形式を切り替え
      li.textContent = (lang !== "ja") ? enName : `${jpName} / ${enName}`;
      listContainer.appendChild(li);
    }
  });
}

function updateIslandListInTab() {
  const select = document.getElementById('filter-island');
  const listContainer = document.getElementById('island-list');
  listContainer.innerHTML = '';

  // 見出し（多言語対応）
  const heading = translations[lang]?.island || "島嶼";
  listContainer.innerHTML = `<h3>${heading}</h3>`;

  Array.from(select.options).forEach(option => {
    if (option.value !== '') {
      const li = document.createElement('li');
      const jpName = option.value;
      const enName = islandMeta.find(m => m.jp === jpName)?.en || "-";

      // 表示言語に応じて内容を変更
      li.textContent = (lang !== "ja") ? enName : `${jpName} / ${enName}`;
      listContainer.appendChild(li);
    }
  });
}

const updateSpeciesListInTab = () => {
  const listContainer = document.getElementById('species-list');
  listContainer.innerHTML = '';

  // 見出し（多言語対応）
  const heading = translations[lang]?.species || "種";
  listContainer.innerHTML = `<h3>${heading}</h3>`;

  const validRows = filteredRows.filter(r => r.scientificName && r.scientificName !== "-");

  const tree = {};
  validRows.forEach(row => {
    const { order, family, genus, scientificName, taxonRank, japaneseName } = row;
    if (!tree[order]) tree[order] = {};
    if (!tree[order][family]) tree[order][family] = {};
    if (!tree[order][family][genus]) tree[order][family][genus] = {};

    if (taxonRank === "subspecies") {
      const parentScientificName = scientificName.split(" ").slice(0, 2).join(" ");
      const taxonEntry = taxonMap[parentScientificName] || {};

      if (!tree[order][family][genus][parentScientificName]) {
        tree[order][family][genus][parentScientificName] = {
          rank: "species",
          japaneseName: taxonEntry.japaneseName || "(親種名不明)",
          subspecies: new Set()
        };
      }

      const uniqueKey = `${scientificName}|||${japaneseName}`;
      tree[order][family][genus][parentScientificName].subspecies.add(uniqueKey);
    } else {
      if (!tree[order][family][genus][scientificName]) {
        tree[order][family][genus][scientificName] = {
          rank: taxonRank,
          japaneseName,
          subspecies: new Set()
        };
      }
    }
  });

  let speciesCounter = 1;

  const getNo = (name, rank) => {
    const entry = Object.entries(taxonMap).find(([sci, data]) =>
      data && data.rank === rank && sci === name
    );
    return entry ? parseInt(entry[1].no) || Infinity : Infinity;
  };

  const sortByNo = (names, rank) => {
    return names.sort((a, b) => getNo(a, rank) - getNo(b, rank));
  };

  const createLi = (html, indent = 0, className = '') => {
    const li = document.createElement('li');
    const showHigher = document.getElementById("toggle-higher-taxonomy")?.checked;
    let adjustedIndent = indent;

    if (!showHigher) {
      if (indent === 3) adjustedIndent = 0;
      if (indent === 4) adjustedIndent = 1;
    }

    li.style.marginLeft = `${adjustedIndent * 1.2}em`;
    li.innerHTML = html;
    if (className) li.classList.add(className);
    listContainer.appendChild(li);
  };

  const getDisplayName = (sci) => {
    const entry = taxonMap[sci] || {};
    const jpn = entry.japaneseName || "-";
    const author = entry.authorYear && entry.authorYear !== "-" ? ` <span class="non-italic">${entry.authorYear}</span>` : "";
    return { jpn, sci, author };
  };

  const isNominotypical = (subSci) => {
    const parts = subSci.split(" ");
    return parts.length === 3 && parts[1] === parts[2];
  };

  sortByNo(Object.keys(tree), "order").forEach(order => {
    let orderFormatted = formatOrderFamilyName(`${getDisplayName(order).jpn} / ${order}`);
    if (lang !== "ja") orderFormatted = orderFormatted.replace(/^.*?\/\s*/, "");
    createLi(orderFormatted, 0, 'higher-taxonomy');

    sortByNo(Object.keys(tree[order]), "family").forEach(family => {
      let familyFormatted = formatOrderFamilyName(`${getDisplayName(family).jpn} / ${family}`);
      if (lang !== "ja") familyFormatted = familyFormatted.replace(/^.*?\/\s*/, "");
      createLi(familyFormatted, 1, 'higher-taxonomy');

      sortByNo(Object.keys(tree[order][family]), "genus").forEach(genus => {
        let genusFormatted = formatGenusName(`${getDisplayName(genus).jpn} / ${genus}`);
        if (lang !== "ja") genusFormatted = genusFormatted.replace(/^.*?\/\s*/, "");
        createLi(genusFormatted, 2, 'higher-taxonomy');

        const speciesList = Object.entries(tree[order][family][genus]);

        speciesList
          .sort((a, b) => {
            const aNo = getNo(a[0], a[1].rank);
            const bNo = getNo(b[0], b[1].rank);
            if (aNo !== bNo) return aNo - bNo;
            return a[0].localeCompare(b[0]);
          })
          .forEach(([sci, data]) => {
            if (data.rank === "subspecies") return;

            let label = formatSpeciesName(`${data.japaneseName} / ${sci}`);
            if (lang !== "ja") label = label.replace(/^.*?\/\s*/, "");
            label = `${speciesCounter}. ${label}`;
            createLi(label, 3);

            const subspeciesArray = Array.from(data.subspecies);
            subspeciesArray.sort((a, b) => {
              const [aSci] = a.split("|||");
              const [bSci] = b.split("|||");
              const aIsNom = isNominotypical(aSci);
              const bIsNom = isNominotypical(bSci);
              if (aIsNom && !bIsNom) return -1;
              if (!aIsNom && bIsNom) return 1;
              return aSci.localeCompare(bSci);
            });

            subspeciesArray.forEach((entry, idx) => {
              const [subSci, subJpn] = entry.split("|||");
              const subInfo = taxonMap[subSci] || {};
              const subAuthor = subInfo.authorYear && subInfo.authorYear !== "-" ? ` <span class="non-italic">${subInfo.authorYear}</span>` : "";

              let formattedSubSci = subSci.match(/ord\.|fam\.|gen\./)
                ? `<span class="non-italic">${subSci}</span>`
                : `<i>${subSci}</i>`;

              formattedSubSci = formattedSubSci
                .replace(/\bcf\./g, '<span class="non-italic">cf.</span>')
                .replace(/\baff\./g, '<span class="non-italic">aff.</span>');

              let subLabel = `${subJpn} / ${formattedSubSci}${subAuthor}`;
              if (lang !== "ja") subLabel = `${formattedSubSci}${subAuthor}`;
              subLabel = `${speciesCounter}.${idx + 1} ${subLabel}`;
              createLi(subLabel, 4);
            });

            speciesCounter++;
          });
      });
    });
  });

  const showHigher = document.getElementById("toggle-higher-taxonomy")?.checked;
  document.querySelectorAll(".higher-taxonomy").forEach(el => {
    el.style.display = showHigher ? "" : "none";
  });
};

// ==================== メイン処理 ====================


// ==================== Box selection (rectangle) ====================
// boxBounds: { west, south, east, north } (LngLat) / null
let boxSelectMode = false;
let boxBounds = null;

const BOX_SOURCE_ID = "box-selection";
const BOX_FILL_LAYER_ID = "box-selection-fill";
const BOX_LINE_LAYER_ID = "box-selection-line";

function getEmptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function getBoxPolygonFeature(bounds) {
  const { west, south, east, north } = bounds;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]]
    },
    properties: {}
  };
}

function ensureBoxLayers() {
  if (!map) return;

  // style 未ロードだと addSource/addLayer が落ちるのでガード
  if (!map.isStyleLoaded || !map.isStyleLoaded()) {
    // 初回 load と style 変更の両方に対応
    map.once("load", ensureBoxLayers);
    map.once("styledata", ensureBoxLayers);
    return;
  }

  if (!map.getSource(BOX_SOURCE_ID)) {
    map.addSource(BOX_SOURCE_ID, {
      type: "geojson",
      data: getEmptyFeatureCollection()
    });
  }

  if (!map.getLayer(BOX_FILL_LAYER_ID)) {
    map.addLayer({
      id: BOX_FILL_LAYER_ID,
      type: "fill",
      source: BOX_SOURCE_ID,
      paint: {
        "fill-color": "#000",
        "fill-opacity": 0.08
      }
    });
  }

  if (!map.getLayer(BOX_LINE_LAYER_ID)) {
    map.addLayer({
      id: BOX_LINE_LAYER_ID,
      type: "line",
      source: BOX_SOURCE_ID,
      paint: {
        "line-color": "#000",
        "line-width": 2
      }
    });
  }
}

function updateBoxLayer() {
  if (!map) return;
  ensureBoxLayers();

  const src = map.getSource(BOX_SOURCE_ID);
  if (!src) return;

  if (!boxBounds) {
    src.setData(getEmptyFeatureCollection());
    return;
  }

  src.setData({
    type: "FeatureCollection",
    features: [getBoxPolygonFeature(boxBounds)]
  });
}

function clearBoxSelection({ apply = true } = {}) {
  boxBounds = null;
  updateBoxLayer();
  if (apply && typeof applyFilters === "function") {
    applyFilters(true);
    if (typeof updateURL === "function") updateURL();
    setBoxSelectMode(false);
  }
}

function setBoxSelectMode(on) {
  boxSelectMode = !!on;

  const overlay = document.getElementById("box-select-overlay");
  if (overlay) {
    overlay.classList.toggle("active", boxSelectMode);
  }

  // カーソル（環境によって overlay の class 切替だけだと残ることがあるので明示）
  if (map && map.getCanvas) {
    map.getCanvas().style.cursor = boxSelectMode ? "crosshair" : "";
  }

  // モード中は地図操作を止める（ドラッグ＝矩形になるように）
  if (map) {
    if (boxSelectMode) {
      if (map.dragPan) map.dragPan.disable();
      if (map.scrollZoom) map.scrollZoom.disable();
      if (map.doubleClickZoom) map.doubleClickZoom.disable();
      if (map.dragRotate) map.dragRotate.disable();
      if (map.keyboard) map.keyboard.disable();
      if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
    } else {
      if (map.dragPan) map.dragPan.enable();
      if (map.scrollZoom) map.scrollZoom.enable();
      if (map.doubleClickZoom) map.doubleClickZoom.enable();
      if (map.dragRotate) map.dragRotate.enable();
      if (map.keyboard) map.keyboard.enable();
      if (map.touchZoomRotate) map.touchZoomRotate.enableRotation();
    }
  }
}

function initBoxSelection() {
  const toggleBtn = document.getElementById("box-select-toggle");
  const clearBtn = document.getElementById("box-select-clear");
  const overlay = document.getElementById("box-select-overlay");
  const rectEl = document.getElementById("box-select-rect");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      setBoxSelectMode(!boxSelectMode);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearBoxSelection({ apply: true });
    });
  }

  if (!overlay || !rectEl) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;

  function hideRect() {
    rectEl.style.display = "none";
  }

  function showRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    rectEl.style.display = "block";
    rectEl.style.left = left + "px";
    rectEl.style.top = top + "px";
    rectEl.style.width = width + "px";
    rectEl.style.height = height + "px";
  }

  overlay.addEventListener("pointerdown", (e) => {
    if (!boxSelectMode) return;

    e.preventDefault();
    e.stopPropagation();

    const r = overlay.getBoundingClientRect();
    startX = e.clientX - r.left;
    startY = e.clientY - r.top;

    dragging = true;
    showRect(startX, startY, startX, startY);

    overlay.setPointerCapture(e.pointerId);
  });

  overlay.addEventListener("pointermove", (e) => {
    if (!boxSelectMode || !dragging) return;

    e.preventDefault();
    e.stopPropagation();

    const r = overlay.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    showRect(startX, startY, x, y);
  });

  function finishDrag(e) {
    if (!boxSelectMode || !dragging) return;

    e.preventDefault();
    e.stopPropagation();

    dragging = false;
    hideRect();

    // pointer capture を解除（環境によっては残ると挙動が不安定になる）
    try {
      overlay.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const r = overlay.getBoundingClientRect();
    const endX = e.clientX - r.left;
    const endY = e.clientY - r.top;

    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // クリックに近い小さい矩形は無視（ただしモードは解除する）
    if (Math.abs(maxX - minX) < 8 || Math.abs(maxY - minY) < 8) {
      setBoxSelectMode(false);
      return;
    }

    // 画面座標 -> 緯度経度（LngLat）
    const p1 = map.unproject([minX, minY]); // 左上
    const p2 = map.unproject([maxX, maxY]); // 右下

    const west = Math.min(p1.lng, p2.lng);
    const east = Math.max(p1.lng, p2.lng);
    const south = Math.min(p1.lat, p2.lat);
    const north = Math.max(p1.lat, p2.lat);

    boxBounds = { west, south, east, north };
    updateBoxLayer();

    applyFilters(true);
    if (typeof updateURL === "function") updateURL();

    // 1回選択したら範囲選択モードを解除する
    setBoxSelectMode(false);
  }

  overlay.addEventListener("pointerup", finishDrag);

  // キャンセル時は確定せずにモードだけ解除
  overlay.addEventListener("pointercancel", (e) => {
    if (!boxSelectMode || !dragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    hideRect();
    try {
      overlay.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setBoxSelectMode(false);
  });

  // Esc でモード解除
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && boxSelectMode) {
      setBoxSelectMode(false);
    }
  });

  // 地図ができたらレイヤーも用意
  ensureBoxLayers();
}


document.addEventListener("DOMContentLoaded", async () => {
  // 1. 地図の初期化
  initMap();

  // 1-b. 矩形選択（ボックス）初期化
  initBoxSelection();

  // 2. CSV類の読み込み
  await loadTaxonNameCSV();
  await loadOrderCSV("Prefecture.csv", prefectureOrder, "prefecture");
  await loadOrderCSV("Island.csv", islandOrder, "island");
  await loadLiteratureCSV();
  await loadDistributionCSV(); // rowsにデータが入る

  // レコード件数等を表示
  updateRecordInfo(rows.length, new Set(rows.map(r => `${r.latitude},${r.longitude}`)).size);

  // 3. URLクエリから状態オブジェクトを取得（セレクト・チェックボックス等を含む）
  let restoredState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  if (window.location.search) {
const params = new URLSearchParams(window.location.search);

// 矩形選択（BBox）: URL から復元（bbox=west,south,east,north）
if (params.has("bbox")) {
  const raw = params.get("bbox") || "";
  const parts = raw.split(",").map(s => parseFloat(s.trim()));
  if (parts.length === 4 && parts.every(v => Number.isFinite(v))) {
    const [w, s, e, n] = parts;
    // 念のため正規化（min/max）
    boxBounds = {
      west: Math.min(w, e),
      south: Math.min(s, n),
      east: Math.max(w, e),
      north: Math.max(s, n)
    };
  }
}

  
    // 年フィルタのON判定（既に追加済み）
    if (params.has("publicationYearFrom") || params.has("publicationYearTo")) {
      restoredState.filterPublicationYearActive = true;
    }
    if (params.has("collectionYearFrom") || params.has("collectionYearTo")) {
      restoredState.filterCollectionYearActive = true;
    }
    if (params.has("biennialTargetYear") || params.has("biennialInterval")) {
      restoredState.filterBiennialActive = true;
    }
  
    // 🔽 ここを追加：ライフステージ（成体/幼体）クエリ処理
    const lifeStageKeys = ["adult", "juvenile_unknown"];
    let lifeStageChecked = false;
    restoredState.selectedLifeStages = [];
  
    lifeStageKeys.forEach(key => {
      if (params.has(key)) {
        restoredState.selectedLifeStages.push(key);
        lifeStageChecked = true;
      }
    });
    if (lifeStageChecked) {
      restoredState.filterLifeStageActive = true;
    }
  
    // 通常のパラメータ
    ["filterOrder", "filterFamily", "filterGenus", "filterSpecies", "filterPrefecture", "filterIsland", "filterLiterature"].forEach(key => {
      if (params.has(key)) restoredState[key] = params.get(key);
    });
  
    ["publicationYearFrom", "publicationYearTo", "collectionYearFrom", "collectionYearTo", "biennialTargetYear", "biennialInterval"].forEach(key => {
      if (params.has(key)) restoredState[key] = params.get(key);
    });
  
    [
      "filterCollectionMonthActive", "filterLifeStageActive", "excludeUnpublished", "excludeDubious", "excludeCitation",
      "excludeUndescribed", "excludeUnspecies", "legendMasterCheckbox", "filterType", "filterSynonymizedType",
      "filterDoubtfulType", "filterDoubtfulSynonymizedType", "filterSpecimen", "filterLiteratureRecord",
      "filterDoubtfulLiterature", "toggleHigherTaxonomy"
    ].forEach(key => {
      if (params.has(key)) restoredState[key] = params.get(key) === "1";
    });
  
    ["classification", "chartMode", "yearMode", "countMode"].forEach(key => {
      if (params.has(key)) restoredState[key] = params.get(key);
    });
  
    if (params.has("collectionMonths")) {
    const m = params.get("collectionMonths") || "";

    // 旧仕様(12桁)にも対応
    if (m.length === 13) {
      for (let i = 0; i < 13; i++) {
        restoredState.collectionMonths[i] = m[i] === "1";
      }
    } else if (m.length === 12) {
      for (let i = 0; i < 12; i++) {
        restoredState.collectionMonths[i] = m[i] === "1";
      }
      restoredState.collectionMonths[12] = false; // 不明（13番目）
    }
  }
  }  

  // 4. セレクトボックス候補の取得・初期化（ここで値もセットされる）
  const selectOptions = gatherSelectOptions(rows);
  updateSelectBoxes(restoredState, selectOptions);

  // 5. セレクト以外のDOMへの反映（チェックボックスや年スライダーなど）
  applyStateToDOM(restoredState);

  // 6. 各種イベントリスナー
  setupCheckboxListeners();
  setupNavButtonListeners();
  setupResetButton();

  map.on("zoomstart", () => {
    clearMarkers()
    isZooming = true;
  
    const tooltip = document.querySelector(".marker-tooltip");
    if (tooltip) tooltip.style.display = "none";
  });

  map.on("zoomend", () => {
    displayMarkers(filteredRows)
    isZooming = false;
  });

  setTimeout(() => updateDropdownPlaceholders(), 100);

  setupLegendToggle();
  setupPopupClose();
  setupSearchContainerToggle();
  linkMasterAndDubiousCheckboxes();
  setupClassificationRadio();

  // 「高次分類群を表示」のON/OFFで、種リストのインデントも含めて再計算する。
// （.higher-taxonomy を直接 show/hide するだけだと、種/亜種の字下げが更新されないため）
document.getElementById("toggle-higher-taxonomy").addEventListener("change", () => {
    updateSpeciesListInTab();
    // URL 状態（toggleHigherTaxonomy=1/0）も同期
    if (typeof updateURL === "function") updateURL();
  });

  const masterCb = document.getElementById("legend-master-checkbox");
  const allCbs = document.querySelectorAll(".marker-filter-checkbox");
  masterCb.addEventListener("change", () => {
    allCbs.forEach(cb => {
      cb.checked = masterCb.checked;
    });
    applyFilters();
    updateURL();
  });
  allCbs.forEach(cb => {
    cb.addEventListener("change", () => {
      masterCb.checked = [...allCbs].every(x => x.checked);
    });
  });

  const tabHeaderItems = document.querySelectorAll(".tab-header li");
  const tabContents = document.querySelectorAll(".tab-content");
  tabHeaderItems.forEach(item => {
    item.addEventListener("click", () => {
      tabHeaderItems.forEach(i => i.classList.remove("active"));
      tabContents.forEach(t => t.classList.remove("active"));
      item.classList.add("active");
      const targetId = item.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab-data" && filteredRows && filteredRows.length > 0) {
        generateMonthlyChart(filteredRows);
        generatePrefectureChart(filteredRows);
        updateYearChart();
      }
    });
  });

  generatePrefectureChart(filteredRows);
  updateYearChart();

  document.querySelectorAll('input[name="year-mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      updateYearChart();
      updateURL();
    });
  });

  document.querySelectorAll('input[name="count-mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      updateYearChart();
      updateURL();
    });
  });
// 画面幅の切替で search-container の配置が変わるため、Select2 の幅も再計算する
let lastLayoutIsNarrow = window.innerWidth <= 711;

window.addEventListener("resize", () => {
  adjustSearchContainerAndLegend();

  const nowIsNarrow = window.innerWidth <= 711;
  if (nowIsNarrow !== lastLayoutIsNarrow) {
    lastLayoutIsNarrow = nowIsNarrow;
    // レイアウトが大きく切り替わるタイミングで Select2 を再初期化して幅を追従させる
    try {
      initializeSelect2();
      updateDropdownPlaceholders();
    } catch (e) {
      console.warn("Select2 refresh failed on resize:", e);
    }
  }

  if (filteredRows && filteredRows.length > 0) {
    generateMonthlyChart(filteredRows);
    generatePrefectureChart(filteredRows);
    updateYearChart();
  }
});

  adjustSearchContainerAndLegend();

  // translation.csv の読み込み完了を待つ（失敗してもページは動かす）
  if (window.translationsReady) {
    try {
      await window.translationsReady;
    } catch (e) {
      console.warn("translation.csv load failed:", e);
    }
  }

  const savedLang = localStorage.getItem("preferredLanguage");
  const langSelector = document.getElementById("language-selector");
  const selectedLang = savedLang || "ja";
  if (langSelector) langSelector.value = selectedLang;
  applyTranslations(selectedLang);
  lang = selectedLang;

  if (langSelector) {
    langSelector.addEventListener("change", () => {
      const selectedLang = langSelector.value;
      applyTranslations(selectedLang);
      localStorage.setItem("preferredLanguage", selectedLang);
      lang = selectedLang;

      updateDropdownPlaceholders();

      if (filteredRows && filteredRows.length > 0) {
        generateMonthlyChart(filteredRows);
        generatePrefectureChart(filteredRows);
        generateLiteratureList(filteredRows);
        updateSelectedLabels();
        updateSpeciesListInTab();
        updatePrefectureListInTab();
        updateIslandListInTab();
        initializeSelect2();

        const mode = document.querySelector('input[name="year-mode"]:checked')?.value || 'publication';
        updateYearChart();
      }

      const newStyle = {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          japan: {
            type: "geojson",
            data: "Japan.geojson",
            attribution: translations[lang]?.map_attribution
          }
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "rgba(173, 216, 230, 1)" } },
          { id: "japan", type: "fill", source: "japan", paint: { "fill-color": "#fff", "fill-outline-color": "#000" } },
          { id: "japan-outline", type: "line", source: "japan", paint: { "line-color": "#000", "line-width": 1 } }
        ]
      };

map.setStyle(newStyle);
// style切替でボックス選択レイヤーが消えるので復元
try {
  map.once("styledata", () => {
    if (typeof updateBoxLayer === "function") updateBoxLayer();
  });
} catch (e) {
  console.warn("box layer restore failed:", e);
}
    });
  }
  // ページ初期化ボタンの処理
  const resetPageBtn = document.getElementById("reset-page-button");
  if (resetPageBtn) {
    resetPageBtn.addEventListener("click", () => {
      // 1. 初期状態をDOMに反映
      applyStateToDOM(DEFAULT_STATE);
  
      // 2. セレクトボックスを初期化
      const selectOptions = gatherSelectOptions(rows);
      updateSelectBoxes(DEFAULT_STATE, selectOptions);
  
      // 3. 隔年フィルタや年スライダーの有効/無効も更新（←これが抜けていた）
      updateFilterActivationUI();
  
      // 4. セレクトボックスフィルタのみ初期化してフィルタ適用
      const filters = {
        species: "",
        genus: "",
        family: "",
        order: "",
        prefecture: "",
        island: "",
        literature: ""
      };

      if (typeof clearBoxSelection === "function") {
        clearBoxSelection({ apply: false });
        if (typeof setBoxSelectMode === "function") setBoxSelectMode(false);
      }

      applyFilters(true, filters);
  
      // 5. URL更新・ラベル更新
      updateURL();
      updateSelectedLabels();
    });
  }
});