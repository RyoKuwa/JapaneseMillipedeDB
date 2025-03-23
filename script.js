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
        { id: "background", type: "background", paint: { "background-color": "rgba(173, 216, 230, 1)" } },
        { id: "japan", type: "fill", source: "japan", paint: { "fill-color": "#fff", "fill-outline-color": "#000" } },
        { id: "japan-outline", type: "line", source: "japan", paint: { "line-color": "#000", "line-width": 1 } }
      ]
    },
    center: [136, 35.7],
    zoom: defaultZoom,
    maxZoom: 9,
    minZoom: 3,
    dragPan: !isTouchDevice,  // タッチデバイスなら初期はOFF, PCはON
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

    // 読み込み後、初回フィルタを実行
    applyFilters(true);
  } catch (error) {
    console.error("CSV の読み込みエラー:", error);
  }
};

// ==================== フィルタリングロジック ====================
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

const populateSelect = (id, options, defaultText, selectedValue) => {
  const select = document.getElementById(id);
  if (!select) return;

  const currentVal = select.value;
  const currentOpt = select.querySelector(`option[value="${CSS.escape(currentVal)}"]`);
  const currentLabel = currentOpt ? currentOpt.textContent : currentVal;

  $(select).empty();

  $(select).append(new Option(defaultText, "", false, false));

  options.forEach(opt => {
    $(select).append(new Option(opt.label, opt.value, false, false));
  });

  // currentValがまだ候補にないなら追加しておく
  const exists = options.some(opt => opt.value === currentVal);
  if (currentVal && !exists) {
    $(select).append(new Option(currentLabel, currentVal, true, true));
  }

  // 選択状態を再設定
  $(select).val(currentVal).trigger("change");
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

const updateFilters = (filteredData) => {
  // 最新のセレクトボックスの選択状態を取得（保持するため）
  const filters = {
    species: document.getElementById("filter-species")?.value || "",
    genus: document.getElementById("filter-genus")?.value || "",
    family: document.getElementById("filter-family")?.value || "",
    order: document.getElementById("filter-order")?.value || "",
    prefecture: document.getElementById("filter-prefecture")?.value || "",
    island: document.getElementById("filter-island")?.value || "",
    literature: document.getElementById("filter-literature")?.value || ""
  };

  const selectOptions = gatherSelectOptions(filteredData);
  updateSelectBoxes(filters, selectOptions);

  updateSpeciesListInTab();
  updatePrefectureListInTab();
  updateIslandListInTab();
};

const applyFilters = async (updateMap = true) => {
  try {
    const { filters, checkboxes } = getFilterStates();
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
    filteredRows = filteredRowsLocal;
    updateFilters(filteredRowsLocal);
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
      generatePublicationChart(filteredRowsLocal);
      generateCollectionChart(filteredRowsLocal);
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
  // 既存のSelect2をすべて破棄
  [
    "#filter-order", 
    "#filter-family", 
    "#filter-genus", 
    "#filter-species", 
    "#filter-prefecture", 
    "#filter-island", 
    "#filter-literature"
  ].forEach(id => {
    try {
      if ($(id).data('select2')) {
        $(id).select2('destroy');
      }
    } catch (e) {
      console.log(`Select2破棄エラー(${id}):`, e);
    }
    $(id).off();  // イベント解除
  });

  const selectBoxes = [
    { id: "#filter-order", placeholder: "目を選択" },
    { id: "#filter-family", placeholder: "科を選択" },
    { id: "#filter-genus", placeholder: "属を選択" },
    { id: "#filter-species", placeholder: "種を選択" },
    { id: "#filter-prefecture", placeholder: "都道府県を選択" },
    { id: "#filter-island", placeholder: "島を選択" },
    { id: "#filter-literature", placeholder: "文献を選択" }
  ];

  const safelyInitSelect2 = (id, options) => {
    try {
      const currentVal = $(id).val(); // 現在の選択値を保存
  
      $(id).select2(options); // 初期化
  
      // 選択値を再設定（Select2が options にない値でも表示される）
      if (currentVal) {
        $(id).val(currentVal).trigger("change");
      }
  
      return true;
    } catch (e) {
      console.error(`Select2初期化エラー(${id}):`, e);
      return false;
    }
  };
  
  const setupCustomClearButton = (id) => {
    const selectElement = $(id);
    const selectContainer = selectElement.next('.select2-container');

    selectContainer.find('.custom-select2-clear').remove();

    const arrow = selectContainer.find('.select2-selection__arrow');
    const clearButton = $('<span class="custom-select2-clear">✕</span>');
    arrow.parent().append(clearButton);

    const updateButtonsVisibility = () => {
      if (selectElement.val() && selectElement.val().length > 0) {
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
      updateSelectedLabels();

      if (selectElement.data('select2')?.isOpen()) {
        selectElement.select2('close');
      }

      return false;
    });

    selectContainer.css('position', 'relative');

    selectElement.on('change', updateButtonsVisibility);
    selectElement.on('select2:open select2:close', updateButtonsVisibility);
  };

  selectBoxes.forEach(({ id, placeholder }) => {
    const count = $(id).find("option:not(:first-child)").length;
    const placeholderWithCount = `${placeholder}（${count}件）`;

    const initSuccess = safelyInitSelect2(id, {
      placeholder: placeholderWithCount,
      allowClear: false,
      minimumResultsForSearch: 0,
      dropdownAutoWidth: true
    });

    if (initSuccess) {
      setupCustomClearButton(id);

      $(id).on("select2:select", function () {
        applyFilters(true);
        updateSelectedLabels();
      });
    }
  });

  setTimeout(() => {
    selectBoxes.forEach(({ id }) => {
      setupCustomClearButton(id);
    });
  }, 500);
};

// ドロップダウンのプレースホルダー更新関数
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
    try {
      // プレースホルダーのみ更新（初期化し直さない）
      const select2Instance = selectEl.data('select2');
      if (select2Instance && select2Instance.$container) {
        const placeholderElement = select2Instance.$container.find('.select2-selection__placeholder');
        if (placeholderElement.length) {
          placeholderElement.text(`${baseText}（${count}件）`);
        }
      }
      
      // 値が選択されている場合は、矢印を隠してクリアボタンを表示
      const selectContainer = selectEl.next('.select2-container');
      const arrow = selectContainer.find('.select2-selection__arrow');
      const clearButton = selectContainer.find('.custom-select2-clear');
      
      if (selectEl.val() && selectEl.val().length > 0) {
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

// セレクトボックスのイベント設定
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
  
  // 既存のイベントリスナーを全て解除
  dropDownIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) {
      const clone = sel.cloneNode(true);
      sel.parentNode.replaceChild(clone, sel);
    }
  });
  
  // 新しいイベントリスナーを設定
  dropDownIds.forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.addEventListener("change", function() {
        applyFilters(true);
        updateSelectedLabels();
        
        // 矢印とクリアボタンの表示を更新
        const selectEl = $(`#${id}`);
        const selectContainer = selectEl.next('.select2-container');
        const arrow = selectContainer.find('.select2-selection__arrow');
        const clearButton = selectContainer.find('.custom-select2-clear');
        
        if (this.value) {
          arrow.hide();
          clearButton.show();
        } else {
          arrow.show();
          clearButton.hide();
        }
      });
    }
  });
}

// チェックボックスイベントのセットアップ関数
function setupCheckboxListeners() {
  const checkboxIds = [
    "exclude-unpublished",
    "exclude-dubious",
    "exclude-citation",
    "exclude-undescribed",
    "exclude-unspecies"
  ];
  
  // 既存のイベントリスナーを全て解除
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
      cb.addEventListener("change", () => applyFilters(true));
    }
  });

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
      <div class="popup-wrapper" style="overflow-y: auto;">
        ${popupContent}
      </div>
      <div class="popup-footer" style="margin-top: 5px; text-align: center;">
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

  // 前へ/次へボタンのイベント設定
  document.getElementById("prev-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex - 1 + total) % total;
    showPopup(currentPopupIndex);
  });
  document.getElementById("next-popup").addEventListener("click", () => {
    currentPopupIndex = (currentPopupIndex + 1) % total;
    showPopup(currentPopupIndex);
  });

  // 表示後に高さを調整
  setTimeout(() => {
    const popupWrapper = document.querySelector(".popup-wrapper");
    if (!popupWrapper) return;

    // マーカー位置を取得
    const markerPixel = map.project([record.longitude, record.latitude]);

    // 上端からの距離を計算（少し余裕を持たせる）
    const distanceFromTop = markerPixel.y;
    const safeMargin = 80; // フッター高さ + 余裕
    const maxHeight = Math.max(100, distanceFromTop - safeMargin);

    popupWrapper.style.maxHeight = `${maxHeight}px`;
  }, 0);
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
  // ★★★ タイトルを外部HTML要素に設定する例 ★★★
  const monthTitleEl = document.getElementById("month-chart-title");
  if (monthTitleEl) {
    monthTitleEl.textContent = "出現期（月別）";
  }

  if (monthChart) monthChart.destroy();
  
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
        title: { display: false } // Chart.js内蔵タイトルはオフ
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
  const prefTitleEl = document.getElementById("prefecture-chart-title");
  if (prefTitleEl) {
    const classTxt = (currentClassification === "order") ? "目別" : "科別";
    const measureTxt = 
      (currentChartMode === "ratio") ? "割合" :
      (currentChartMode === "record") ? "記録数" : "種数";
    prefTitleEl.textContent = `各都道府県の${classTxt}${measureTxt}`;
  }

  if (prefectureChart) prefectureChart.destroy();

  const classificationKey = currentClassification;
  const chartMode = currentChartMode;
  const excludeUndescribed = document.getElementById("exclude-undescribed")?.checked;
  const validRanks = ["species", "species complex", "subspecies"];

  const targetRows = allRows.filter(row => {
    const rank = row.taxonRank?.toLowerCase();
    if (!validRanks.includes(rank)) return false;
    if (excludeUndescribed && row.undescribedSpecies?.toLowerCase() === "yes") {
      return false;
    }
    return true;
  });

  const prefectureTaxonMap = {};
  const prefectureRecordMap = {};

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

    // 種数カウント
    if (!prefectureTaxonMap[pref]) prefectureTaxonMap[pref] = {};
    if (!prefectureTaxonMap[pref][keyValue]) prefectureTaxonMap[pref][keyValue] = new Set();
    prefectureTaxonMap[pref][keyValue].add(nm);

    // 記録数カウント
    if (!prefectureRecordMap[pref]) prefectureRecordMap[pref] = {};
    if (!prefectureRecordMap[pref][keyValue]) prefectureRecordMap[pref][keyValue] = 0;
    prefectureRecordMap[pref][keyValue]++;
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
  } else if (chartMode === "record") {
    const arr = Object.keys(prefectureRecordMap).map(pref => {
      const obj = prefectureRecordMap[pref];
      const total = Object.values(obj).reduce((sum, count) => sum + count, 0);
      return { pref, total };
    });
    arr.sort((a, b) => b.total - a.total);
    sortedPrefectures = arr.map(i => i.pref);
  } else {
    sortedPrefectures = prefectureOrder.filter(p => !!prefectureTaxonMap[p]);
  }

  const taxonSet = new Set();
  for (const pref in (chartMode === "record" ? prefectureRecordMap : prefectureTaxonMap)) {
    for (const tKey in (chartMode === "record" ? prefectureRecordMap[pref] : prefectureTaxonMap[pref])) {
      taxonSet.add(tKey);
    }
  }
  const taxons = Array.from(taxonSet).sort();

  const datasets = taxons.map((taxon, index) => {
    const data = [];
    const absData = [];

    sortedPrefectures.forEach(pref => {
      let count = 0;

      if (chartMode === "record") {
        count = prefectureRecordMap[pref]?.[taxon] || 0;
      } else {
        count = prefectureTaxonMap[pref]?.[taxon]?.size || 0;
      }

      absData.push(count);

      if (chartMode === "ratio") {
        const totalOfPref = Object.values(prefectureTaxonMap[pref])
          .reduce((s, st) => s + st.size, 0);
        const ratioNum = totalOfPref === 0 ? 0 : ((count / totalOfPref) * 100).toFixed(1);
        data.push(parseFloat(ratioNum));
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
          title: {
            display: true,
            text: (chartMode === "ratio")
              ? "割合(%)"
              : (chartMode === "record")
                ? "記録数"
                : "種数"
          }
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
          display: false
        }
      },
      barThickness: 20
    }
  });
}

function generatePublicationChart(rows) {
  const yearData = {};  // {year: {recordType: count}}

  rows.forEach(row => {
    const year = parseInt(row.publicationYear);
    const type = row.recordType;
    if (!Number.isInteger(year)) return;
    if (!yearData[year]) yearData[year] = {};
    if (!yearData[year][type]) yearData[year][type] = 0;
    yearData[year][type]++;
  });

  const sortedYears = Object.keys(yearData).map(y => parseInt(y)).sort((a, b) => a - b);

  const originalTypes = [
    "1_タイプ産地",
    "2_統合された種のタイプ産地",
    "3_疑わしいタイプ産地",
    "4_疑わしい統合された種のタイプ産地",
    "5_標本記録",
    "6_文献記録",
    "7_疑わしい文献記録"
  ];

  const displayLabels = [
    "タイプ",
    "統合された種のタイプ",
    "疑わしいタイプ",
    "疑わしい統合された種のタイプ",
    "標本記録",
    "文献記録",
    "疑わしい文献記録"
  ];

  const colors = [
    "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"
  ];

  const datasets = [];
  const activeTypes = [];

  originalTypes.forEach((type, index) => {
    const data = sortedYears.map(year => yearData[year][type] || 0);
    const total = data.reduce((a, b) => a + b, 0);
    if (total > 0) {
      datasets.push({
        label: displayLabels[index],
        backgroundColor: colors[index],
        data: data,
        stack: 'stack1'
      });
      activeTypes.push(type);
    }
  });

  let cumulativeSum = 0;
  const cumulativeArray = sortedYears.map(year => {
    const total = activeTypes.reduce((sum, type) => sum + (yearData[year][type] || 0), 0);
    cumulativeSum += total;
    return cumulativeSum;
  });

  datasets.push({
    label: '累積記録数',
    data: cumulativeArray,
    type: 'line',
    borderColor: 'black',
    backgroundColor: 'black',
    fill: false,
    yAxisID: 'y-axis-2',
    tension: 0.1,
    pointRadius: 0
  });

  const ctx = document.getElementById("publication-chart").getContext("2d");
  if (window.publicationChart) {
    window.publicationChart.destroy();
  }

  window.publicationChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedYears,
      datasets: datasets
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          position: 'top',
          onClick: null // ← 凡例クリック無効化
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: '記録数'
          }
        },
        'y-axis-2': {
          type: 'linear',
          position: 'right',
          grid: {
            drawOnChartArea: false
          },
          title: {
            display: true,
            text: '累積記録数'
          }
        }
      }
    }
  });
}

function generateCollectionChart(rows) {
  const yearData = {};

  rows.forEach(row => {
    const year = parseInt(row.collectionYear);
    const type = row.recordType;
    if (!Number.isInteger(year)) return;
    if (!yearData[year]) yearData[year] = {};
    if (!yearData[year][type]) yearData[year][type] = 0;
    yearData[year][type]++;
  });

  const sortedYears = Object.keys(yearData).map(y => parseInt(y)).sort((a, b) => a - b);

  const originalTypes = [
    "1_タイプ産地",
    "2_統合された種のタイプ産地",
    "3_疑わしいタイプ産地",
    "4_疑わしい統合された種のタイプ産地",
    "5_標本記録",
    "6_文献記録",
    "7_疑わしい文献記録"
  ];

  const displayLabels = [
    "タイプ",
    "統合された種のタイプ",
    "疑わしいタイプ",
    "疑わしい統合された種のタイプ",
    "標本記録",
    "文献記録",
    "疑わしい文献記録"
  ];

  const colors = [
    "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"
  ];

  const datasets = [];
  const activeTypes = [];

  originalTypes.forEach((type, index) => {
    const data = sortedYears.map(year => yearData[year][type] || 0);
    const total = data.reduce((a, b) => a + b, 0);
    if (total > 0) {
      datasets.push({
        label: displayLabels[index],
        backgroundColor: colors[index],
        data: data,
        stack: 'stack1'
      });
      activeTypes.push(type);
    }
  });

  let cumulativeSum = 0;
  const cumulativeArray = sortedYears.map(year => {
    const total = activeTypes.reduce((sum, type) => sum + (yearData[year][type] || 0), 0);
    cumulativeSum += total;
    return cumulativeSum;
  });

  datasets.push({
    label: '累積記録数',
    data: cumulativeArray,
    type: 'line',
    borderColor: 'black',
    backgroundColor: 'black',
    fill: false,
    yAxisID: 'y-axis-2',
    tension: 0.1,
    pointRadius: 0
  });

  const ctx = document.getElementById("collection-chart").getContext("2d");
  if (window.collectionChart) {
    window.collectionChart.destroy();
  }

  window.collectionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedYears,
      datasets: datasets
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          position: 'top',
          onClick: null // ← 凡例クリック無効化
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: '記録数'
          }
        },
        'y-axis-2': {
          type: 'linear',
          position: 'right',
          grid: {
            drawOnChartArea: false
          },
          title: {
            display: true,
            text: '累積記録数'
          }
        }
      }
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
      const parts = labelText.split(" / ");
      labelText = `${parts[1]} / ${parts[0]}`;
    }

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

  Array.from(select.options).forEach(option => {
    if (option.value !== '') {
      const li = document.createElement('li');
      const jpName = option.value;
      const enName = prefectureMeta.find(m => m.jp === jpName)?.en || "-";
      li.textContent = `${jpName} / ${enName}`;
      listContainer.appendChild(li);
    }
  });
}

function updateIslandListInTab() {
  const select = document.getElementById('filter-island');
  const listContainer = document.getElementById('island-list');
  listContainer.innerHTML = '';

  Array.from(select.options).forEach(option => {
    if (option.value !== '') {
      const li = document.createElement('li');
      const jpName = option.value;
      const enName = islandMeta.find(m => m.jp === jpName)?.en || "-";
      li.textContent = `${jpName} / ${enName}`;
      listContainer.appendChild(li);
    }
  });
}

function updateSpeciesListInTab() {
  const listContainer = document.getElementById('species-list');
  listContainer.innerHTML = '';

  const validRows = filteredRows.filter(r => r.scientificName && r.scientificName !== "-");

  const tree = {};
  validRows.forEach(row => {
    const { order, family, genus, scientificName, taxonRank, japaneseName } = row;
    if (!tree[order]) tree[order] = {};
    if (!tree[order][family]) tree[order][family] = {};
    if (!tree[order][family][genus]) tree[order][family][genus] = {};
    if (!tree[order][family][genus][scientificName]) {
      tree[order][family][genus][scientificName] = {
        rank: taxonRank,
        japaneseName,
        subspecies: new Set()
      };
    }
    if (taxonRank === "subspecies") {
      tree[order][family][genus][scientificName].subspecies.add(japaneseName);
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

  const createLi = (html, indent = 0) => {
    const li = document.createElement('li');
    li.style.marginLeft = `${indent * 1.2}em`;
    li.innerHTML = html;
    listContainer.appendChild(li);
  };

  const getDisplayName = (sci) => {
    const entry = taxonMap[sci] || {};
    const jpn = entry.japaneseName || "-";
    const author = entry.authorYear && entry.authorYear !== "-" ? ` <span class="non-italic">${entry.authorYear}</span>` : "";
    return { jpn, sci, author };
  };

  sortByNo(Object.keys(tree), "order").forEach(order => {
    const orderFormatted = formatOrderFamilyName(`${getDisplayName(order).jpn} / ${order}`);
    createLi(orderFormatted, 0);

    sortByNo(Object.keys(tree[order]), "family").forEach(family => {
      const familyFormatted = formatOrderFamilyName(`${getDisplayName(family).jpn} / ${family}`);
      createLi(familyFormatted, 1);

      sortByNo(Object.keys(tree[order][family]), "genus").forEach(genus => {
        const genusFormatted = formatGenusName(`${getDisplayName(genus).jpn} / ${genus}`);
        createLi(genusFormatted, 2);

        const speciesList = Object.entries(tree[order][family][genus]);

        speciesList.sort((a, b) => {
          const aNo = getNo(a[0], a[1].rank);
          const bNo = getNo(b[0], b[1].rank);
          return aNo - bNo;
        }).forEach(([sci, data]) => {
          if (data.rank === "subspecies") return;

          const label = `${speciesCounter}. ${formatSpeciesName(`${data.japaneseName} / ${sci}`)}`;
          createLi(label, 3);

          Array.from(data.subspecies).sort().forEach((subJpn, idx) => {
            const subEntry = Object.entries(taxonMap).find(([k, v]) =>
              v.japaneseName === subJpn && v.rank === "subspecies"
            );
            const subSci = subEntry?.[0] || "-";
            const subInfo = taxonMap[subSci] || {};
            const subAuthor = subInfo.authorYear && subInfo.authorYear !== "-" ? ` <span class="non-italic">${subInfo.authorYear}</span>` : "";
            let formattedSubSci = subSci.match(/ord\.|fam\.|gen\./)
              ? `<span class="non-italic">${subSci}</span>`
              : `<i>${subSci}</i>`;

            // cf., aff. は非斜体化
            formattedSubSci = formattedSubSci
              .replace(/\bcf\./g, '<span class="non-italic">cf.</span>')
              .replace(/\baff\./g, '<span class="non-italic">aff.</span>');

            const subLabel = `${speciesCounter}.${idx + 1} ${subJpn} / ${formattedSubSci}${subAuthor}`;
            createLi(subLabel, 4);
          });

          speciesCounter++;
        });
      });
    });
  });
}

// ==================== メイン処理 ====================
document.addEventListener("DOMContentLoaded", async () => {
  initMap();

  // CSV類読み込み
  await loadTaxonNameCSV();
  await loadOrderCSV("Prefecture.csv", prefectureOrder, "prefecture");
  await loadOrderCSV("Island.csv", islandOrder, "island");
  await loadLiteratureCSV();
  await loadDistributionCSV(); // rowsにデータが入る

  updateRecordInfo(rows.length, new Set(rows.map(r => `${r.latitude},${r.longitude}`)).size);

  setupSelectListeners();
  setupCheckboxListeners();
  setupNavButtonListeners();
  setupResetButton();
  map.on("zoomend", () => displayMarkers(filteredRows));

  setTimeout(() => initializeSelect2(), 50);
  setTimeout(() => updateDropdownPlaceholders(), 100);

  setupLegendToggle();
  setupPopupClose();
  setupSearchContainerToggle();
  setupChartLegendToggles();
  linkMasterAndDubiousCheckboxes();
  setupClassificationRadio();

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

  generatePrefectureChart(filteredRows);

  window.addEventListener("resize", () => {
    adjustSearchContainerAndLegend();
    if (filteredRows && filteredRows.length > 0) {
      generateMonthlyChart(filteredRows);
      generatePrefectureChart(filteredRows);
      generatePublicationChart(filteredRows);
      generateCollectionChart(filteredRows);
    }
  });

  adjustSearchContainerAndLegend();

  applyFilters(true);
});
