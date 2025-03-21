// ==================== グローバル変数 ====================
let map;
let rows = [];
let taxonMap = {};
let prefectureOrder = [];
let islandOrder = [];
let markers = [];
let literatureArray = [];
let clusterGroup;

// ポップアップ関連
let currentPopupIndex = 0;
let nearbyRecords = [];
let activePopup = null;
let filteredRows = []; // フィルタリングされたデータ

// グラフ関連
let monthChart = null;
let prefectureChart = null;
let currentClassification = "order";  // "order" or "family"
let currentChartMode = "count";       // "count" or "ratio"

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
          attribution: "「<a href='https://nlftp.mlit.go.jp/ksj/' target='_blank'>位置参照情報ダウンロードサービス</a>」（国土交通省）を加工して作成"
        }
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "rgba(173, 216, 230, 1)" }
        },
        {
          id: "japan",
          type: "fill",
          source: "japan",
          paint: {
            "fill-color": "rgba(255, 255, 255, 1)",
            "fill-outline-color": "rgba(0, 0, 0, 1)"
          }
        },
        {
          id: "japan-outline",
          type: "line",
          source: "japan",
          paint: {
            "line-color": "rgba(0, 0, 0, 1)",
            "line-width": 1
          }
        }
      ]
    },
    center: [136, 35.7],
    zoom: defaultZoom,
    maxZoom: 9,
    minZoom: 3,
    dragPan: !isTouchDevice,  // タッチデバイスなら無効、PCなら有効
    touchZoomRotate: true
  });

  // 地図コントロール
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');

  // タッチデバイス向けパン操作制御
  if (isTouchDevice) {
    map.on('touchstart', (e) => {
      if (e.points && e.points.length >= 2) {
        map.dragPan.enable();
      } else {
        map.dragPan.disable();
      }
    });
    map.on('touchmove', (e) => {
      if (e.points && e.points.length >= 2) {
        map.dragPan.enable();
      } else {
        map.dragPan.disable();
      }
    });
    map.on('touchend', () => {
      map.dragPan.disable();
    });
  }

  updateSelectedLabels();
};

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

      // カンマ区切りを安全に処理
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

      const [order, id, litList, link] = columns;
      if (id && litList) {
        literatureArray.push({ 
          id, 
          label: litList.trim(),
          link: link ? link.trim() : null,
          order: parseInt(order, 10) || index
        });
      }
    });
  } catch (error) {
    console.error("Literature.csv の読み込みエラー:", error);
  }
};

const loadTaxonNameCSV = () => {
  loadCSV("TaxonName.csv", (csvText) => {
    const lines = csvText.split("\n").filter(line => line.trim());
    lines.forEach((line, idx) => {
      if (idx === 0) return; // ヘッダーをスキップ

      const columns = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(col => col.replace(/^"|"$/g, '').trim());
      if (!columns || columns.length < 3) return;

      const [japaneseName, scientificName, ...authorYearParts] = columns;
      let authorYear = authorYearParts.join(", ").replace(/,\s*$/, "").trim();

      taxonMap[scientificName] = {
        japaneseName: japaneseName || "-",
        authorYear: authorYear || "-"
      };
    });
  });
};

// Promiseを返す形にする
function loadOrderCSV(fileName, arrayStorage) {
  return new Promise((resolve, reject) => {
    loadCSV(fileName, (csvText) => {
      const lines = csvText.split("\n").filter(line => line.trim());
      lines.forEach((line, index) => {
        if (index === 0) return;
        arrayStorage.push(line.trim());
      });
      resolve(); // 読み込み完了を通知
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
      collectedMonth: record["採集月"] || "-",
      taxonRank: record["階級"] || "-",
      undescribedSpecies: record["未記載種の可能性が高い_幼体等で同定が困難な場合はno"] || "-"
    }));

    // 読み込み後、初回フィルタを実行
    applyFilters(true);
  } catch (error) {
    console.error("CSV の読み込みエラー:", error);
  }
};

// ==================== フィルタリングロジック ====================
/** 現在のセレクトボックス＆チェックボックス状態を取得 */
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
    filterIntegratedType: document.getElementById("filter-integrated-type").checked,
    filterDoubtfulType: document.getElementById("filter-doubtful-type").checked,
    filterDoubtfulIntegratedType: document.getElementById("filter-doubtful-integrated-type").checked,
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
    if (checkboxes.excludeUnspecies && row.taxonRank.toLowerCase() !== "species") {
      return false;
    }
    if (checkboxes.excludeUnpublished && isUnpublished) return false;
    if (checkboxes.excludeDubious && isDubious) return false;
    if (checkboxes.excludeCitation && isCitation) return false;

    // マーカー種別ごとの表示可否
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

/** セレクトボックスに表示する候補を集める (検索窓なし) */
const gatherSelectOptions = (data) => {
  // 1) 文献
  const literatureOptions = literatureArray
    .filter(item => data.some(row => row.literatureID === item.id))
    .map(item => ({ value: item.id, label: item.label }));

  // 2) 種 (学名/和名)
  const combinedNames = [...new Set(data.map(row => `${row.scientificName} / ${row.japaneseName}`))]
    .sort();

  // 3) 目・科・属
  const getOptions = (dataKey) => {
    const uniqueMap = new Map();
    data.forEach(r => {
      const val = r[dataKey] || "-";
      if (!uniqueMap.has(val)) {
        const jName = taxonMap[val]?.japaneseName || "-";
        uniqueMap.set(val, { value: val, label: `${val} / ${jName}` });
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

  // 4) 都道府県・島
  const getPrefIslandOptions = (dataKey, refArray) => {
    return refArray
      .filter(item => data.some(row => row[dataKey] === item))
      .map(item => ({ value: item, label: item }));
  };

  return {
    literatureOptions,
    combinedNames,
    genusOptions: getOptions("genus"),
    familyOptions: getOptions("family"),
    orderOptions: getOptions("order"),
    prefectureOptions: getPrefIslandOptions("prefecture", prefectureOrder),
    islandOptions: getPrefIslandOptions("island", islandOrder)
  };
};

/** セレクトボックスのDOM構築 */
const populateSelect = (id, options, defaultText, selectedValue) => {
  const select = document.getElementById(id);
  if (!select) return;

  const currentVal = select.value;
  $(select).empty();

  // デフォルトオプション
  $(select).append(new Option(defaultText, "", false, false));

  // 候補を追加
  options.forEach(opt => {
    $(select).append(new Option(opt.label, opt.value, false, false));
  });

  // 可能なら前の選択を復元
  if (options.some(opt => opt.value === currentVal)) {
    $(select).val(currentVal).trigger("change");
  } else {
    $(select).val("").trigger("change");
  }
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

  populateSelect("filter-literature",
    literatureOptions.map(opt => ({
      value: opt.value,
      label: opt.label.replace(/<\/?i>/g, '')
    })),
    "文献を選択",
    filters.literature
  );
  populateSelect("filter-species",
    combinedNames.map(name => ({ value: name, label: name })),
    "種を選択",
    filters.species
  );
  populateSelect("filter-genus", genusOptions, "属を選択", filters.genus);
  populateSelect("filter-family", familyOptions, "科を選択", filters.family);
  populateSelect("filter-order", orderOptions, "目を選択", filters.order);
  populateSelect("filter-prefecture", prefectureOptions, "都道府県を選択", filters.prefecture);
  populateSelect("filter-island", islandOptions, "島を選択", filters.island);
};

/** 絞り込み結果をセレクトボックスに反映 */
const updateFilters = (filteredData) => {
  const { filters, checkboxes } = getFilterStates();
  // ここで改めてcheckBoxフィルタをしない: applyFilters()で既に済
  // => 下行の "dataAfterCheckbox" を "filteredData" に変更する
  const selectOptions = gatherSelectOptions(filteredData);
  updateSelectBoxes(filters, selectOptions);
};

/** 最終的なフィルタを実行し、地図やグラフを更新 */
const applyFilters = async (updateMap = true) => {
  try {
    const { filters, checkboxes } = getFilterStates();
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }

    // 1) セレクトボックス条件
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

    // 2) チェックボックス条件
    filteredRowsLocal = filterByCheckbox(filteredRowsLocal, checkboxes);

    // 3) セレクトボックス候補再生成
    updateFilters(filteredRowsLocal);

    // 4) 選択ラベル更新
    updateSelectedLabels();

    // 5) レコード数・地点数
    updateRecordInfo(
      filteredRowsLocal.length,
      new Set(filteredRowsLocal.map(r => `${r.latitude},${r.longitude}`)).size
    );

    // 6) 文献リスト
    generateLiteratureList(filteredRowsLocal);

    // 7) 地図・グラフ更新
    if (updateMap) {
      displayMarkers(filteredRowsLocal);
      generateMonthlyChart(filteredRowsLocal);
      generatePrefectureChart(filteredRowsLocal);
    }

    updateDropdownPlaceholders();
    filteredRows = filteredRowsLocal;

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
  listContainer.innerHTML = "<h3>引用文献 Reference</h3>";

  const ordered = literatureArray.filter(i => titles.includes(i.label));
  const ol = document.createElement('ol');
  ordered.forEach(item => {
    const li = document.createElement('li');
    let listItem = item.label;
    if (item.link) {
      listItem += ` <a href="${item.link}" target="_blank">${item.link}</a>`;
    }
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
  const item = literatureArray.find(i => i.id === literatureID);
  return {
    literatureName: item ? item.label : "不明",
    literatureLink: item?.link || null
  };
};

// ==================== Select2 初期化 ====================
const initializeSelect2 = () => {
  const selectBoxes = [
    { id: "#filter-order", placeholder: "目を選択" },
    { id: "#filter-family", placeholder: "科を選択" },
    { id: "#filter-genus", placeholder: "属を選択" },
    { id: "#filter-species", placeholder: "種を選択" },
    { id: "#filter-prefecture", placeholder: "都道府県を選択" },
    { id: "#filter-island", placeholder: "島を選択" },
    { id: "#filter-literature", placeholder: "文献を選択" }
  ];

  selectBoxes.forEach(({ id, placeholder }) => {
    // ① Select2 化
    $(id).select2({
      placeholder: placeholder,
      allowClear: true,
      minimumResultsForSearch: 0,
      dropdownAutoWidth: true
    });

    // ② Select2 独自イベントで絞り込み
    //    ユーザがマウスで選んだ/クリアした時などに呼ばれる
    $(id).on("select2:select select2:unselect select2:clear", () => {
      applyFilters(true);
      updateSelectedLabels();
    });

    // ③ 「▽ と ✕」の見た目調整
    const updateClearButton = () => {
      setTimeout(() => {
        $(".select2-container").each(function () {
          const selectContainer = $(this);
          const selectElement = $("#" + selectContainer.prev("select").attr("id"));
          if (!selectElement.length) return;

          const arrow = selectContainer.find(".select2-selection__arrow");
          const clear = selectContainer.find(".select2-selection__clear");

          if (selectElement.val()) {
            arrow.hide();
            clear.css({
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              cursor: "pointer",
              zIndex: "10"
            }).show();
          } else {
            arrow.show();
            clear.hide();
          }
        });
      }, 10);
    };

    $(id).on("select2:open select2:select select2:unselect", () => {
      updateClearButton();
    });
    $(id).closest(".select-container").find(".nav-button").on("click", () => {
      updateClearButton();
    });
  });
};

const updateDropdownPlaceholders = () => {
  const items = [
    { id: "#filter-order", baseText: "目を選択" },
    { id: "#filter-family", baseText: "科を選択" },
    { id: "#filter-genus", baseText: "属を選択" },
    { id: "#filter-species", baseText: "種を選択" },
    { id: "#filter-prefecture", baseText: "都道府県を選択" },
    { id: "#filter-island", baseText: "島を選択" },
    { id: "#filter-literature", baseText: "文献を選択" }
  ];

  items.forEach(({ id, baseText }) => {
    const selectEl = $(id);
    if (!selectEl.data("select2")) return;
    const count = selectEl.find("option:not(:first-child)").length;
    selectEl.select2({
      placeholder: `${baseText}（${count}件）`,
      allowClear: true,
      minimumResultsForSearch: 0,
      dropdownAutoWidth: true
    });
  });
};

// ==================== セレクトボックス/チェックボックスのイベント設定 ====================
function setupSelectListeners() {
  const dropDownIds = [
    "filter-species",
    "filter-genus",
    "filter-family",
    "filter-order",
    "filter-prefecture",
    "filter-island",
    "filter-literature"
  ];
  dropDownIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) {
      // 原生の "change" イベント(前/次ボタンなどでvalueを変えた時に発火)
      sel.addEventListener("change", () => {
        applyFilters(true);
        updateSelectedLabels();
      });
    }
  });
}

function setupCheckboxListeners() {
  // 主要チェックボックス
  [
    "exclude-unpublished",
    "exclude-dubious",
    "exclude-citation",
    "exclude-undescribed",
    "exclude-unspecies"
  ].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) {
      cb.addEventListener("change", () => applyFilters(true));
    }
  });

  // マーカー種類チェックボックス
  document.querySelectorAll(".marker-filter-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", () => applyFilters(true));
  });
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
    { prevBtn: "prev-literature", nextBtn: "next-literature", selId: "filter-literature" }
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

  // 一時的に選択解除→フィルタ更新
  select.value = "";
  await applyFilters(false);

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
};

// ==================== リセットボタン ====================
const setupResetButton = () => {
  const resetBtn = document.getElementById("reset-button");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      // セレクトボックスを未選択に
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

      // マーカークリア & ラベル更新
      clearMarkers();
      updateSelectedLabels();

      // チェックボックスは状態を維持
      applyFilters(true);
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

// ポップアップの外をクリックで閉じる
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

// サーチコンテナの開閉
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
    tooltip.textContent = "クリックで詳細表示";
    document.body.appendChild(tooltip);
  }

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
      if (!isTouchDevice) {
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

const showPopup = (index) => {
  if (!nearbyRecords.length) return;

  const record = nearbyRecords[index];
  const total = nearbyRecords.length;
  if (activePopup) activePopup.remove();

  const { popupContent } = preparePopupContent([record]).popupContents[0];
  const popupHtml = `
    <div>
      <div>${popupContent}</div>
      <div style="margin-top: 5px; text-align: center;">
        <button id="prev-popup">前へ</button>
        <span>${index + 1} / ${total}</span>
        <button id="next-popup">次へ</button>
      </div>
    </div>
  `;

  activePopup = new maplibregl.Popup({
    focusAfterOpen: false,
    closeOnClick: false,
    anchor: "bottom"
  })
    .setLngLat([record.longitude, record.latitude])
    .setHTML(popupHtml)
    .addTo(map);

  document.getElementById("prev-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex - 1 + total) % total;
    showPopup(currentPopupIndex);
  });
  document.getElementById("next-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex + 1) % total;
    showPopup(currentPopupIndex);
  });
};

const preparePopupContent = (filteredData) => {
  const recordTypeMapping = {
    "1_タイプ産地": "タイプ産地",
    "2_統合された種のタイプ産地": "統合された種のタイプ産地",
    "3_疑わしいタイプ産地": "疑わしいタイプ産地",
    "4_疑わしい統合された種のタイプ産地": "疑わしい統合された種のタイプ産地",
    "5_標本記録": "標本記録",
    "6_文献記録": "文献記録",
    "7_疑わしい文献記録": "疑わしい記録"
  };

  const popupContents = filteredData.map(row => {
    if (!row.latitude || !row.longitude) return null;
    const { literatureName, literatureLink } = getLiteratureInfo(row.literatureID);
    const recordType = recordTypeMapping[row.recordType] || "不明";

    let content = `
      <strong>${row.japaneseName} ${row.scientificName}</strong><br>
      記録の種類: ${recordType}<br>
    `;
    if (!row.literatureID || row.literatureID === "-") {
      content += "未公表データ Unpublished Data";
    } else {
      content += `
        文献中の和名: ${row.originalJapaneseName || "不明"}<br>
        文献中の学名: ${row.originalScientificName || "不明"}<br>
        ページ: ${row.page || "不明"}<br>
        場所: ${row.location || "不明"}<br>
        採集日: ${row.date || "不明"}<br>
        採集者: ${row.collectorJp || "不明"}<br>
        collector: ${row.collectorEn || "不明"}<br><br>
        文献: ${literatureName} ${
          literatureLink ? `<a href="${literatureLink}" target="_blank">${literatureLink}</a>` : ""
        }<br><br>
        備考: ${row.note}<br>
        記入: ${row.registrant}, ${row.registrationDate}
      `;
    }
    return { row, popupContent: content };
  }).filter(i => i !== null);

  return { popupContents };
};

// ==================== グラフ系 ====================
function generateMonthlyChart(allRows) {
  if (monthChart) monthChart.destroy();

  const monthlySetAdult = Array.from({ length: 12 }, () => new Set());
  const monthlySetJuvenile = Array.from({ length: 12 }, () => new Set());

  allRows.forEach(row => {
    const m = parseInt(row.collectedMonth, 10);
    if (m >= 1 && m <= 12 && row.latitude && row.longitude) {
      const key = `${row.latitude},${row.longitude},${row.scientificName},${row.adultPresence}`;
      if (row.adultPresence?.toLowerCase() === "yes") {
        monthlySetAdult[m - 1].add(key);
      } else {
        monthlySetJuvenile[m - 1].add(key);
      }
    }
  });

  const ctx = document.getElementById('month-chart').getContext('2d');
  monthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["1","2","3","4","5","6","7","8","9","10","11","12"],
      datasets: [
        {
          label: "成体",
          data: monthlySetAdult.map(s => s.size),
          backgroundColor: "rgba(255, 99, 132, 0.6)",
          borderColor: "rgba(255, 99, 132, 1)",
          borderWidth: 1
        },
        {
          label: "幼体・不明",
          data: monthlySetJuvenile.map(s => s.size),
          backgroundColor: "rgba(54, 162, 235, 0.6)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: '月' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: '記録数' },
          ticks: { precision: 0, maxTicksLimit: 20 }
        }
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: '出現期',
          align: 'center',
          font: { size: 16 }
        }
      }
    }
  });
}

function setupChartLegendToggles() {
  const toggleAdult = document.getElementById("toggle-adult");
  const toggleJuvenile = document.getElementById("toggle-juvenile");

  toggleAdult.addEventListener("change", () => {
    if (monthChart) {
      monthChart.data.datasets[0].hidden = !toggleAdult.checked;
      monthChart.update();
    }
  });
  toggleJuvenile.addEventListener("change", () => {
    if (monthChart) {
      monthChart.data.datasets[1].hidden = !toggleJuvenile.checked;
      monthChart.update();
    }
  });
}

function generatePrefectureChart(allRows) {
  if (prefectureChart) prefectureChart.destroy();

  const classificationKey = currentClassification; // "order" or "family"
  const chartMode = currentChartMode; // "count" or "ratio"
  const excludeUndescribed = document.getElementById("exclude-undescribed")?.checked;
  const validRanks = ["species", "species complex", "subspecies"];

  // 対象行
  const targetRows = allRows.filter(row => {
    const rank = row.taxonRank?.toLowerCase();
    if (!validRanks.includes(rank)) return false;
    if (excludeUndescribed && row.undescribedSpecies?.toLowerCase() === "yes") {
      return false;
    }
    return true;
  });

  // 都道府県x(目 or 科) => 種のSet
  const prefectureTaxonMap = {};
  function getNormalizedSpeciesName(row) {
    const rank = row.taxonRank?.toLowerCase();
    const sciName = row.scientificName?.trim() || "";
    if (rank === "subspecies") {
      const parts = sciName.split(/\s+/);
      if (parts.length >= 2) {
        return parts[0] + " " + parts[1];
      }
      return sciName;
    }
    return sciName;
  }

  targetRows.forEach(row => {
    const pref = row.prefecture;
    const keyValue = (classificationKey === "order") ? row.order : row.family;
    if (!pref || pref === "-" || !keyValue || keyValue === "-") return;

    const nm = getNormalizedSpeciesName(row);
    if (!prefectureTaxonMap[pref]) {
      prefectureTaxonMap[pref] = {};
    }
    if (!prefectureTaxonMap[pref][keyValue]) {
      prefectureTaxonMap[pref][keyValue] = new Set();
    }
    prefectureTaxonMap[pref][keyValue].add(nm);
  });

  let sortedPrefectures = [];
  if (chartMode === "count") {
    const arr = Object.keys(prefectureTaxonMap).map(pref => {
      const obj = prefectureTaxonMap[pref];
      const total = Object.values(obj).reduce((sum, setOfSpp) => sum + setOfSpp.size, 0);
      return { pref, total };
    });
    arr.sort((a, b) => b.total - a.total);
    sortedPrefectures = arr.map(i => i.pref);
  } else {
    sortedPrefectures = prefectureOrder.filter(p => !!prefectureTaxonMap[p]);
  }

  const taxonSet = new Set();
  for (const pref in prefectureTaxonMap) {
    for (const tKey in prefectureTaxonMap[pref]) {
      taxonSet.add(tKey);
    }
  }
  const taxons = Array.from(taxonSet).sort();

  const datasets = taxons.map((taxon, index) => {
    const data = [];
    const absData = [];

    sortedPrefectures.forEach(pref => {
      const count = prefectureTaxonMap[pref][taxon]?.size || 0;
      absData.push(count);
      if (chartMode === "ratio") {
        const totalOfPref = Object.values(prefectureTaxonMap[pref])
          .reduce((s, st) => s + st.size, 0);
        if (totalOfPref === 0) {
          data.push(0);
        } else {
          const ratioNum = ((count / totalOfPref) * 100).toFixed(1);
          data.push(parseFloat(ratioNum));
        }
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
    const borderColorPalette = [
      "rgba(255, 99, 132, 1)",
      "rgba(54, 162, 235, 1)",
      "rgba(255, 206, 86, 1)",
      "rgba(75, 192, 192, 1)",
      "rgba(153, 102, 255, 1)",
      "rgba(255, 159, 64, 1)",
      "rgba(199, 199, 199, 1)"
    ];
    const bgColor = colorPalette[index % colorPalette.length];
    const bdColor = borderColorPalette[index % borderColorPalette.length];

    return {
      label: taxon,
      data,
      _absData: absData,
      backgroundColor: bgColor,
      borderColor: bdColor,
      borderWidth: 1,
      order: taxons.length - 1 - index
    };
  });

  const canvas = document.getElementById("prefecture-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  prefectureChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedPrefectures,
      datasets
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 50 } },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: "都道府県" },
          ticks: { autoSkip: false, maxRotation: 60 }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: (chartMode === "ratio") ? 100 : undefined,
          title: { display: true, text: (chartMode === "ratio") ? "割合(%)" : "種数" }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "right",
          labels: {
            generateLabels: function (chart) {
              const ds = chart.data.datasets;
              return ds.map((d, i) => {
                const sciName = d.label;
                const jName = taxonMap[sciName]?.japaneseName || "-";
                return {
                  text: `${sciName} / ${jName}`,
                  fillStyle: d.backgroundColor,
                  strokeStyle: d.borderColor,
                  lineWidth: d.borderWidth,
                  hidden: !chart.isDatasetVisible(i),
                  datasetIndex: i
                };
              }).sort((a, b) => a.text.localeCompare(b.text));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const ds = ctx.dataset;
              const val = ctx.parsed.y;
              const idx = ctx.dataIndex;
              const taxonName = ds.label;
              if (chartMode === "ratio") {
                const absCount = ds._absData[idx] || 0;
                return `${taxonName}: ${val}% (${absCount}種)`;
              } else {
                return `${taxonName}: ${val}`;
              }
            }
          }
        },
        title: {
          display: true,
          text: (classificationKey === "order")
            ? `各都道府県の${(chartMode === "ratio") ? "割合" : "種数"}（目別）`
            : `各都道府県の${(chartMode === "ratio") ? "割合" : "種数"}（科別）`,
          font: { size: 16 }
        }
      },
      barThickness: 20
    }
  });
}

// ==================== UI補助 ====================
function updateRecordInfo(recordCount, locationCount) {
  document.getElementById("record-count").textContent = recordCount;
  document.getElementById("location-count").textContent = locationCount;
}

function updateSelectedLabels() {
  const labelContainer = document.getElementById("selected-labels");
  if (!labelContainer) return;

  const previousHeight = labelContainer.clientHeight;
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
    if (labelText.includes(" / ")) {
      // "学名 / 和名"→"和名 / 学名"
      const parts = labelText.split(" / ");
      labelText = `${parts[1]} / ${parts[0]}`;
    }

    // 目・科・属・種の学名フォーマット
    if (id === "filter-order" || id === "filter-family") {
      labelText = formatOrderFamilyName(labelText);
    } else if (id === "filter-genus") {
      labelText = formatGenusName(labelText);
    } else if (id === "filter-species") {
      labelText = formatSpeciesName(labelText);
    } else if (id === "filter-literature") {
      const litID = opt.value;
      const { literatureName, literatureLink } = getLiteratureInfo(litID);
      labelText = literatureLink
        ? `${literatureName} <a href="${literatureLink}" target="_blank">${literatureLink}</a>`
        : literatureName;
    }

    labelText = labelText
      .replace(/-/g, "&#8209;")
      .replace(/\[/g, "&#91;")
      .replace(/\]/g, "&#93;");
    return labelText;
  }).filter(x => x);

  if (labels.length > 0) {
    labelContainer.innerHTML = labels.join("<br>");
    labelContainer.style.display = "block";
  } else {
    labelContainer.innerHTML = "";
    labelContainer.style.display = "none";
  }

  const newHeight = labelContainer.clientHeight;
  const diff = newHeight - previousHeight;
  if (window.innerWidth > 711 && diff !== 0) {
    window.scrollTo({ top: window.scrollY + diff, behavior: "instant" });
  }
}

// 目・科・属・種の表記フォーマット
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
  let formatted = sciName
    .replace(/\(/g, '<span class="non-italic">(</span>')
    .replace(/\)/g, '<span class="non-italic">)</span>');
  const cleanSciName = sciName.replace(/<\/?i>/g, "").trim();
  const taxonInfo = taxonMap[cleanSciName] || { authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;

  if (formatted.match(/ord\.|fam\.|gen\./)) {
    return `${jName} / <span class="non-italic">${formatted}</span>${authorYear}`;
  }
  if (formatted.includes("sp.") && !formatted.match(/ord\.|fam\.|gen\./)) {
    formatted = formatted.replace(/(.*?)(sp\..*)/, '<i>$1</i><span class="non-italic">$2</span>');
  } else {
    formatted = `<i>${formatted}</i>`;
  }
  return `${jName} / ${formatted}${authorYear}`;
};

/** 疑わしい記録のチェックボックス連動 */
function linkMasterAndDubiousCheckboxes() {
  const masterCheckbox = document.getElementById("legend-master-checkbox");
  const filterDoubtfulType = document.getElementById("filter-doubtful-type");
  const filterDoubtfulIntegrated = document.getElementById("filter-doubtful-integrated-type");
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
  });

  const onDubiousChange = () => {
    if (areAnyDubiousOn()) {
      excludeDubious.checked = false;
    } else {
      excludeDubious.checked = true;
    }
    applyFilters();
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
  });

  if (areAllDubiousOff()) {
    excludeDubious.checked = true;
  } else {
    excludeDubious.checked = false;
  }
}

/** 目/科 & 種数/割合 のラジオボタン */
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

// ==================== レスポンシブ調整 ====================
let preventResize = false;

const adjustSearchContainerAndLegend = () => {
  if (preventResize) return;
  const searchContainer = document.querySelector(".search-container");
  const mapContainer = document.getElementById("mapid");
  const legend = document.querySelector(".legend");
  const selectedLabels = document.getElementById("selected-labels");
  if (!searchContainer || !mapContainer || !legend || !selectedLabels) return;

  if (window.innerWidth <= 711) {
    // スマホ幅
    const parent = mapContainer.parentNode;
    parent.insertBefore(searchContainer, mapContainer);
    searchContainer.insertAdjacentElement("afterend", selectedLabels);

    const paddingValue = parseInt(window.getComputedStyle(searchContainer).paddingLeft, 10) || 0;
    searchContainer.style.position = "relative";
    searchContainer.style.width = `${mapContainer.offsetWidth - paddingValue * 2}px`;

    const toggleButton = document.getElementById("toggle-button");
    toggleButton.style.right = "10px";
    toggleButton.style.top = "10px";
    toggleButton.style.bottom = "auto";

    if (legend.parentNode !== mapContainer.parentNode) {
      mapContainer.insertAdjacentElement("afterend", legend);
    }
    legend.style.position = "relative";
    legend.style.width = `${mapContainer.offsetWidth}px`;
    legend.style.bottom = "auto";
    legend.style.right = "auto";
  } else {
    // PC幅
    searchContainer.style.position = "absolute";
    searchContainer.style.width = "auto";
    mapContainer.appendChild(searchContainer);

    const toggleButton = document.getElementById("toggle-button");
    toggleButton.style.right = "10px";
    toggleButton.style.bottom = "10px";
    toggleButton.style.top = "auto";

    if (legend.parentNode !== mapContainer) {
      mapContainer.appendChild(legend);
    }
    legend.style.position = "absolute";
    legend.style.width = "340px";
    legend.style.bottom = "30px";
    legend.style.right = "10px";
  }
};

// ==================== メイン処理 ====================
document.addEventListener("DOMContentLoaded", async () => {
  initMap();

  // CSV類読み込み
  await loadTaxonNameCSV();
  await loadOrderCSV("Prefecture.csv", prefectureOrder);
  await loadOrderCSV("Island.csv", islandOrder);
  await loadLiteratureCSV();
  await loadDistributionCSV(); // rowsにデータが入る

  // 初期のレコード数・地点数表示
  updateRecordInfo(rows.length, new Set(rows.map(r => `${r.latitude},${r.longitude}`)).size);

  // イベントの設定
  setupSelectListeners();   // 原生の "change" イベント
  setupCheckboxListeners();
  setupNavButtonListeners();
  setupResetButton();
  map.on("zoomend", () => displayMarkers(filteredRows));

  // Select2 初期化 (ここで select2 独自イベント→ applyFilters を仕込む)
  setTimeout(() => initializeSelect2(), 50);
  setTimeout(() => updateDropdownPlaceholders(), 100);

  setupLegendToggle();
  setupPopupClose();
  setupSearchContainerToggle();
  setupChartLegendToggles();
  linkMasterAndDubiousCheckboxes();
  setupClassificationRadio();

  // マスターcheckbox(「マーカーの種類」)全選択/一部選択同期
  const masterCb = document.getElementById("legend-master-checkbox");
  const allCbs = document.querySelectorAll(".marker-filter-checkbox");
  masterCb.addEventListener("change", () => {
    allCbs.forEach(cb => {
      cb.checked = masterCb.checked;
    });
    applyFilters();
  });
  allCbs.forEach(cb => {
    cb.addEventListener("change", () => {
      masterCb.checked = [...allCbs].every(x => x.checked);
    });
  });

  // タブ切り替え
  const tabHeaderItems = document.querySelectorAll(".tab-header li");
  const tabContents = document.querySelectorAll(".tab-content");
  tabHeaderItems.forEach(item => {
    item.addEventListener("click", () => {
      tabHeaderItems.forEach(i => i.classList.remove("active"));
      tabContents.forEach(t => t.classList.remove("active"));
      item.classList.add("active");
      const targetId = item.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // 最初の都道府県グラフ描画
  generatePrefectureChart(filteredRows);

  // 画面サイズ変化対応
  window.addEventListener("resize", adjustSearchContainerAndLegend);
  adjustSearchContainerAndLegend();

  applyFilters(true);
});
