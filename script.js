// ==================== グローバル変数 ====================
let map; // 地図オブジェクトをグローバル変数として宣言
// データの初期化
let rows = [];
let taxonMap = {}; // TaxonName.csvから取得したマッピング
let prefectureOrder = [];
let islandOrder = [];
let markers = []; // マーカーを追跡する配列
let literatureArray = []; // 文献データを保持する配列
let useSearch = false; // 検索窓のフィルタリングのオン・オフ制御
let clusterGroup; // クラスタリング用の変数
// ==================== ポップアップ制御 ====================
// 現在開いているポップアップデータ
let currentPopupIndex = 0;
let nearbyRecords = [];
let activePopup = null;
let filteredRows = []; // フィルタリングされたデータを格納
// ==================== グラフ ====================
let monthChart = null; // 出現期グラフ
let prefectureChart = null;   // 都道府県グラフ
// ==================== 地図の初期設定 ====================
const initMap = () => {
  // 画面幅を取得し、デフォルトのズームレベルを決定
  const defaultZoom = window.innerWidth <= 711 ? 3 : 4;

  map = new maplibregl.Map({
    container: 'mapid',
    style: {
      "version": 8,
      "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      "sources": {
          "japan": {
              "type": "geojson",
              "data": "Japan.geojson",
              attribution: "「<a href='https://nlftp.mlit.go.jp/ksj/' target='_blank'>位置参照情報ダウンロードサービス</a>」（国土交通省）を加工して作成"
          }
      },
      "layers": [
          {
              "id": "background",
              "type": "background",
              "paint": { "background-color": "rgba(173, 216, 230, 1)" }
          },
          {
              "id": "japan",
              "type": "fill",
              "source": "japan",
              "paint": { "fill-color": "rgba(255, 255, 255, 1)", "fill-outline-color": "rgba(0, 0, 0, 1)" }
          },
          {
              "id": "japan-outline",
              "type": "line",
              "source": "japan",
              "paint": { "line-color": "rgba(0, 0, 0, 1)", "line-width": 1 }
          }
      ]
    },
    center: [136, 35.7],
    zoom: defaultZoom,
    maxZoom: 9,
    minZoom: 3
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  // 地図にスケールを追加
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');
  updateSelectedLabels(); // 選択ラベルを更新
};

// ==================== データロード関数 ====================
// CSVファイルを読み込む関数
const loadCSV = async (url, callback) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const csvText = await response.text();
    callback(csvText);
  } catch (error) {
    console.error(`${url}の読み込みエラー:`, error);
  }
};

// 文献データを読み込む関数
const loadLiteratureCSV = async () => {
  try {
      const response = await fetch("Literature.csv");
      if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
      const csvText = await response.text();

      // グローバルスコープの literatureArray を初期化
      literatureArray = [];

      const lines = csvText.split("\n").filter(line => line.trim());

      // データ解析
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

          if (current) {
              columns.push(current.trim());
          }

          const [order, id, litList, link] = columns;

          if (id && litList) {
              literatureArray.push({ 
                  id, 
                  label: litList.trim(), 
                  link: link ? link.trim() : null, // LINKがあれば格納
                  order: parseInt(order, 10) || index 
              });
          }
      });
  } catch (error) {
      console.error("Literature.csv の読み込みエラー:", error);
  }
};

// TaxonName.csv を読み込む
const loadTaxonNameCSV = () => {
  loadCSV("TaxonName.csv", (csvText) => {
    const lines = csvText.split("\n").filter(line => line.trim());

    lines.forEach((line, index) => {
      if (index === 0) return; // ヘッダーをスキップ

      // カンマを含むデータを適切に処理するため、CSVを正しくパース
      const columns = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g).map(col => col.replace(/^"|"$/g, '').trim());

      if (columns.length < 3) return; // データが足りない場合はスキップ

      const [japaneseName, scientificName, ...authorYearParts] = columns;
      let authorYear = authorYearParts.join(", "); // カンマを含む `authorYear` を復元

      // 最後のカンマを削除（念のため前後の余分な空白も除去）
      authorYear = authorYear.replace(/,\s*$/, "").trim();

      taxonMap[scientificName] = {
        japaneseName: japaneseName || "-",
        authorYear: authorYear || "-" // 著者と年がない場合は "-"
      };
    });
  });
};

// Prefecture.csv と Island.csv を読み込む
const loadOrderCSV = (fileName, arrayStorage) => {
  loadCSV(fileName, (csvText) => {
    const lines = csvText.split("\n").filter(line => line.trim());
    lines.forEach((line, index) => {
      if (index === 0) return; // ヘッダーをスキップ
      arrayStorage.push(line.trim());
    });
  });
};

const parseCSV = (text) => {
  const lines = text.split("\n").filter(line => line.trim());
  let headers = lines[0].split(",").map(header => header.replace(/\r/g, "").trim()); // \r を削除

  const data = [];

  lines.slice(1).forEach((line, index) => {
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
      values.push("-"); // 足りないデータは"-"で補完
    }

    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || "-";
    });

    data.push(record);
  });

  return data;
};

// CSV読み込み関数の修正
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

    updateFilters(rows, getFilterStates().filters);
  } catch (error) {
    console.error("CSV の読み込みエラー:", error);
  }
};

// ==================== フィルタリング関数 ====================
// フィルタの選択状態を取得
const getFilterStates = () => {
  // セレクトボックスの現在の選択値を取得
  const filters = {
    species: document.getElementById("filter-species").value,
    genus: document.getElementById("filter-genus").value,
    family: document.getElementById("filter-family").value,
    order: document.getElementById("filter-order").value,
    prefecture: document.getElementById("filter-prefecture").value,
    island: document.getElementById("filter-island").value,
    literature: document.getElementById("filter-literature").value,
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

// 検索窓によるフィルタリング
const filterBySearch = (data, searchValue) => {
  // 検索値を小文字に変換（大文字小文字を区別しない検索のため）useSearch が false の場合、検索窓の値を無視
  const lowercaseSearch = useSearch ? searchValue.toLowerCase() : "";

  // 文献オプションをフィルタリング
  const literatureOptions = literatureArray
    .filter(item =>
      // data の中に一致する文献IDがあるかつ文献名称に検索値が含まれるか確認
      data.some(row => row.literatureID === item.id) &&
      (useSearch ? item.label.toLowerCase().includes(lowercaseSearch) : true)
    )
    .map(item => ({
      // フィルタリングされた文献データをオプション形式に変換
      value: item.id,
      label: item.label
    }));

  // 種の学名/和名を結合してフィルタリング
  const combinedNames = [...new Set(data.map(row => `${row.scientificName} / ${row.japaneseName}`))]
    .filter(name => useSearch ? name.toLowerCase().includes(lowercaseSearch) : true) // 検索値が含まれている名前のみを保持
    .sort(); // 結果をソート

  // 特定のデータキー（属、科、目など）ごとにオプションを生成する関数
  const getOptions = (dataKey) => {
    // 一意の値をマッピングして重複を排除
    const options = [...new Map(data.map(row => [
      row[dataKey],
      {
        value: row[dataKey],
        // 該当する和名が存在しない場合は "-" を設定
        label: `${row[dataKey]} / ${(taxonMap[row[dataKey]]?.japaneseName) || "-"}`
      }
    ])).values()];

    return options
      // 検索値が含まれるオプションのみを保持
      .filter(option => useSearch ? option.label.toLowerCase().includes(lowercaseSearch) : true)
      // 特殊値（"-"）は最後にソート、それ以外はアルファベット順
      .sort((a, b) => {
        if (a.value === "-") return 1;
        if (b.value === "-") return -1;
        return a.value.localeCompare(b.value);
      });
  };

  // **都道府県と島のオプションに useSearch を適用**
  const getPrefectureIslandOptions = (dataKey, referenceArray) => {
    return referenceArray.map(item => ({
      value: item,
      label: item
    })).filter(option =>
      data.some(row => row[dataKey] === option.value) &&
      (useSearch ? option.label.toLowerCase().includes(lowercaseSearch) : true)
    );
  };

  // フィルタリング結果を返す
  return {
    literatureOptions, // フィルタされた文献オプション
    combinedNames, // 学名/和名の結合リスト
    genusOptions: getOptions("genus"), // 属のオプション
    familyOptions: getOptions("family"), // 科のオプション
    orderOptions: getOptions("order"), // 目のオプション
    prefectureOptions: getPrefectureIslandOptions("prefecture", prefectureOrder),
    islandOptions: getPrefectureIslandOptions("island", islandOrder)
  };
};

// チェックボックスによるフィルタリング
const filterByCheckbox = (data, checkboxes) => {
  return data.filter(row => {
    const isUnpublished = row.literatureID === "-" || row.literatureID === "";
    const isDubious = ["3_疑わしいタイプ産地", "4_疑わしい統合された種のタイプ産地", "7_疑わしい文献記録"].includes(row.recordType);
    const isCitation = (row.original.toLowerCase() === "no"); 

    if (checkboxes.excludeUndescribed && row.undescribedSpecies.toLowerCase() === "yes") {
      return false;
    } // 未記載種を除外
    if (checkboxes.excludeUnspecies && row.taxonRank.toLowerCase() !== "species") {
      return false;
    } // 階級が種以外の記録を除外
    if (checkboxes.excludeUnpublished && isUnpublished) return false;
    if (checkboxes.excludeDubious && isDubious) return false;
    if (checkboxes.excludeCitation && isCitation) return false;

    // マーカー種別のチェックが入っていない場合、その記録を除外
    const recordTypeFilter = {
      "1_タイプ産地": checkboxes.filterType,
      "2_統合された種のタイプ産地": checkboxes.filterIntegratedType,
      "3_疑わしいタイプ産地": checkboxes.filterDoubtfulType,
      "4_疑わしい統合された種のタイプ産地": checkboxes.filterDoubtfulIntegratedType,
      "5_標本記録": checkboxes.filterSpecimen,
      "6_文献記録": checkboxes.filterLiteratureRecord,
      "7_疑わしい文献記録": checkboxes.filterDoubtfulLiterature
    };

    return recordTypeFilter[row.recordType] !== false;
  });
};

// セレクトボックスによるフィルタリング
const applyFilters = async (searchValue = "", updateMap = true, useSearch = false) => {
  try {
    // フィルタ状態の取得（選択ボックス + チェックボックス）
    const { filters, checkboxes } = getFilterStates();

    // 既存のポップアップを削除
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }

    // 選択されたフィルタに基づく基本的なデータ抽出
    let filteredRows = rows.filter(row => {
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

    // チェックボックスの状態に基づきデータをフィルタリング
    filteredRows = filterByCheckbox(filteredRows, checkboxes);

    // UI の更新
    updateFilters(filteredRows, { ...filters, searchValue });

    updateSelectedLabels();
    
    // レコード数と地点数の更新
    updateRecordInfo(
      filteredRows.length,
      new Set(filteredRows.map(row => `${row.latitude},${row.longitude}`)).size
    );

    // 文献リストの更新
    generateLiteratureList(filteredRows);

    // 地図のマーカー，グラフを更新
    if (updateMap) {
      displayMarkers(filteredRows);
      generateMonthlyChart(filteredRows);
      generatePrefectureChart(filteredRows);
    }
  } catch (error) {
    console.error("applyFilters中にエラーが発生:", error);
  }
};

// 全フィルタリングを実行
const updateFilters = (filteredData, filters) => {
  const searchValue = getSearchValue();

  const { filters: f, checkboxes } = getFilterStates();

  // チェックボックスによるフィルタリング
  const checkboxFilteredData = filterByCheckbox(filteredData, checkboxes);

  // 検索窓によるフィルタリング
  const searchResults = filterBySearch(checkboxFilteredData, searchValue);

  // セレクトボックスの更新
  updateSelectBoxes({ ...filters, searchValue }, searchResults);
};

// ==================== 値の取得と操作 ====================
// 検索窓の値を取得する関数
const getSearchValue = () => {
  return document.getElementById("search-all").value.toLowerCase();
};

// 検索窓を消去する関数
const clearSearch = () => {
  document.getElementById("search-all").value = "";
};

// セレクトボックスを初期化し該当件数をセレクトボックスのデフォルト表示に反映
const populateSelect = (id, options, defaultText, selectedValue) => {
  const select = document.getElementById(id);

  // 該当件数を計算
  const optionCount = options.length;

  // 選択肢を生成
  const optionsHTML = options.map(option => {
    // ラベルから <i> タグを削除
    const sanitizedLabel = option.label.replace(/<i>(.*?)<\/i>/g, '$1');
    return `<option value="${option.value}" ${option.value === selectedValue ? "selected" : ""}>${sanitizedLabel}</option>`;
  }).join("");

  // デフォルト選択肢を該当件数付きで追加
  select.innerHTML = `<option value="">${defaultText}（${optionCount}件）</option>` + optionsHTML;
};

// 文献リストを更新する関数
const updateLiteratureList = (titles) => {
  const listContainer = document.getElementById('literature-list');
  if (titles.length === 0) {
      listContainer.style.display = "none"; // 文献リスト全体を非表示
      return;
  }

  listContainer.style.display = "block"; // 文献リストを表示
  listContainer.innerHTML = "<h3>引用文献 Reference</h3>";

  // 文献リストをCSV順序で並べ替え
  const orderedLiterature = literatureArray.filter(item => titles.includes(item.label));

  const ol = document.createElement('ol');
  orderedLiterature.forEach(item => {
      const li = document.createElement('li');
      let listItem = item.label; // 文献名称

      // URLがある場合、リンクを追加
      if (item.link) {
          listItem += ` <a href="${item.link}" target="_blank">${item.link}</a>`;
      }

      li.innerHTML = listItem; // HTMLタグを含むタイトルをそのまま挿入
      ol.appendChild(li);
  });

  listContainer.appendChild(ol);
};

// セレクトボックスを更新する関数
const updateSelectBoxes = (filters, searchResults) => {
  const {
    literatureOptions,
    combinedNames,
    genusOptions,
    familyOptions,
    orderOptions,
    prefectureOptions,
    islandOptions
  } = searchResults;

  // 文献セレクトボックスを更新
  populateSelect("filter-literature", literatureOptions, "文献を選択", filters.literature);

  // 種のセレクトボックスを更新
  populateSelect("filter-species",
    combinedNames.map(name => ({ value: name, label: name })),
    "種を選択",
    filters.species
  );

  // 属のセレクトボックスを更新
  populateSelect("filter-genus", genusOptions, "属を選択", filters.genus);
  // 科のセレクトボックスを更新
  populateSelect("filter-family", familyOptions, "科を選択", filters.family);
  // 目のセレクトボックスを更新
  populateSelect("filter-order", orderOptions, "目を選択", filters.order);
  // **都道府県のセレクトボックスを更新**
  populateSelect("filter-prefecture", prefectureOptions, "都道府県を選択", filters.prefecture);
  // **島のセレクトボックスを更新**
  populateSelect("filter-island", islandOptions, "島を選択", filters.island);
};

// 前・次ボタンのクリック時の処理
const setupNavButtonListeners = () => {
  const buttons = [
    { prevButtonId: "prev-species", nextButtonId: "next-species", selectId: "filter-species" },
    { prevButtonId: "prev-genus", nextButtonId: "next-genus", selectId: "filter-genus" },
    { prevButtonId: "prev-family", nextButtonId: "next-family", selectId: "filter-family" },
    { prevButtonId: "prev-order", nextButtonId: "next-order", selectId: "filter-order" },
    { prevButtonId: "prev-prefecture", nextButtonId: "next-prefecture", selectId: "filter-prefecture" },
    { prevButtonId: "prev-island", nextButtonId: "next-island", selectId: "filter-island" },
    { prevButtonId: "prev-literature", nextButtonId: "next-literature", selectId: "filter-literature" }
  ];

  buttons.forEach(({ prevButtonId, nextButtonId, selectId }) => {
    const prevButton = document.getElementById(prevButtonId);
    const nextButton = document.getElementById(nextButtonId);
    const select = document.getElementById(selectId);

    if (prevButton && select) {
      prevButton.addEventListener("click", async () => {
        await navigateOption(selectId, "prev");
      });
    }

    if (nextButton && select) {
      nextButton.addEventListener("click", async () => {
        await navigateOption(selectId, "next");
      });
    }
  });
};

// 前・次の選択肢を求めて選択する関数（ループ対応）
const navigateOption = async (selectId, direction) => {
  const select = document.getElementById(selectId);
  if (!select) return;

  // **① 現在の選択値を保存**
  const selectedValue = select.value;

  // **② フィルタリングを実行 (対象セレクトボックスの選択を "" にする)**
  select.value = ""; // まず、選択を解除
  await applyFilters("", false, false); // フィルタリングを実行し、マップを更新

  // **③ フィルタリング後の選択肢を取得**
  const updatedOptions = Array.from(select.options).map(option => option.value).filter(value => value !== "");

  if (updatedOptions.length === 0) return; // 選択肢がない場合は何もしない

  // **④ 保存された値の前の値 or 次の値を求める**
  let currentIndex = updatedOptions.indexOf(selectedValue);
  
  if (direction === "prev") {
    // **現在が最初の選択肢なら最後にループ、それ以外なら1つ前へ**
    newValue = updatedOptions[(currentIndex - 1 + updatedOptions.length) % updatedOptions.length];
  } else if (direction === "next") {
    // **現在が最後の選択肢なら最初にループ、それ以外なら1つ後へ**
    newValue = updatedOptions[(currentIndex + 1) % updatedOptions.length];
  } else {
    newValue = selectedValue; // 方向が不明な場合は変更しない
  }

  // **⑤ 新しい値を選択**
  select.value = newValue;

  // **⑥ マップを更新**
  await applyFilters("", true, false); // 再度フィルタリングを実行し、マップを更新
};

// 文献情報を取得する関数
const getLiteratureInfo = (literatureID) => {
  const literatureItem = literatureArray.find(item => item.id === literatureID);
  const literatureName = literatureItem ? literatureItem.label : "不明";
  const literatureLink = literatureItem?.link ? literatureItem.link : null;
  return { literatureName, literatureLink };
};

// 文献一覧を作成する関数
const generateLiteratureList = (filteredData) => {
  const literatureNames = new Set(); // 重複を排除するためSetを使用

  filteredData.forEach(row => {
      if (!row.literatureID || row.literatureID === "-") return;
      const { literatureName } = getLiteratureInfo(row.literatureID);
      if (literatureName !== "不明") {
          literatureNames.add(literatureName);
      }
  });

  updateLiteratureList([...literatureNames]); // Setを配列に変換して渡す
};

// クリックされたマーカーの周囲10px以内の記録を取得
const getNearbyRecords = (clickedRecord) => {
  const proximityThreshold = 10; // 10px以内の記録を対象
  const mapBounds = map.getBounds();
  const mapWidth = map.getContainer().offsetWidth;
  const pixelRatio = Math.abs(mapBounds._ne.lng - mapBounds._sw.lng) / mapWidth; // 1pxあたりの緯度経度変換
  const thresholdDegrees = proximityThreshold * pixelRatio; // 10pxを緯度経度に変換

  // クリックしたマーカーの周囲の記録を取得
  let nearbyRecords = filteredRows.filter(record => {
      if (!record.latitude || !record.longitude) return false;
      const distance = Math.sqrt(
          Math.pow(record.latitude - clickedRecord.latitude, 2) +
          Math.pow(record.longitude - clickedRecord.longitude, 2)
      );
      return distance <= thresholdDegrees;
  });

  // 記録の種類の優先順位
  const priority = {
      "1_タイプ産地": 7,
      "2_統合された種のタイプ産地": 6,
      "3_疑わしいタイプ産地": 5,
      "4_疑わしい統合された種のタイプ産地": 4,
      "5_標本記録": 3,
      "6_文献記録": 2,
      "7_疑わしい文献記録": 1
  };

  // クリックした記録を最優先にし、残りを優先順位順にソート
  nearbyRecords = nearbyRecords.sort((a, b) => {
      if (a === clickedRecord) return -1; // クリックした記録を1番目に
      if (b === clickedRecord) return 1;
      return (priority[b.recordType] || 0) - (priority[a.recordType] || 0); // 優先順位順にソート
  });

  return nearbyRecords;
};

// ポップアップを表示
const showPopup = (index) => {
  if (!nearbyRecords.length) return;

  const record = nearbyRecords[index];
  const totalRecords = nearbyRecords.length;

  // 既存のポップアップを閉じる
  if (activePopup) activePopup.remove();

  const { popupContent } = preparePopupContent([record]).popupContents[0];

  const popupHtml = `
      <div>
          <div>${popupContent}</div>
          <div style="margin-top: 5px; text-align: center;">
              <button id="prev-popup">前へ</button>
              <span>${index + 1} / ${totalRecords}</span>
              <button id="next-popup">次へ</button>
          </div>
      </div>
  `;

  // 新しいポップアップを作成
  activePopup = new maplibregl.Popup({
    focusAfterOpen: false,
    closeOnClick: false,
    anchor: "bottom" // ポップアップをマーカーの上に配置
  })
      .setLngLat([record.longitude, record.latitude])
      .setHTML(popupHtml)
      .addTo(map);

  // 「前へ」ボタンの処理
  document.getElementById("prev-popup").addEventListener("click", () => {
      currentPopupIndex = (currentPopupIndex - 1 + totalRecords) % totalRecords;
      showPopup(currentPopupIndex);
  });

  // 「次へ」ボタンの処理
  document.getElementById("next-popup").addEventListener("click", () => {
      currentPopupIndex = (currentPopupIndex + 1) % totalRecords;
      showPopup(currentPopupIndex);
  });
};

// マーカークリック時の処理
const handleMarkerClick = (marker, record) => {
  nearbyRecords = getNearbyRecords(record); // クリックしたマーカーの近くにある記録を取得
  currentPopupIndex = 0; // クリックした記録を必ず1番目にする
  showPopup(currentPopupIndex); // ポップアップを表示
};

//  ==================== グラフ ====================

// 月別の出現期グラフを生成する関数
function generateMonthlyChart(allRows) {
  // 12ヶ月分の配列を0で初期化
  const monthlyCountsAdult = new Array(12).fill(0);
  const monthlyCountsJuvenile = new Array(12).fill(0);

  // 全データを走査して「成体 or 幼体・不明」をカウント
  allRows.forEach(row => {
    // row.collectedMonth が 1～12なら月を取得
    const month = parseInt(row.collectedMonth, 10);
    if (month >= 1 && month <= 12) {
      // 成体かどうかチェック: adultPresence が "yes" なら成体
      const isAdult = (row.adultPresence && row.adultPresence.toLowerCase() === "yes");
      if (isAdult) {
        monthlyCountsAdult[month - 1]++;
      } else {
        monthlyCountsJuvenile[month - 1]++;
      }
    }
  });

  // すでにチャートが存在する場合は破棄（再生成用）
  if (monthChart) {
    monthChart.destroy();
  }

  // Chart.jsでグラフ描画
  const ctx = document.getElementById('month-chart').getContext('2d');

  monthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["1","2","3","4","5","6","7","8","9","10","11","12"],
      datasets: [
        {
          label: "成体",
          data: monthlyCountsAdult,
          backgroundColor: "rgba(255, 99, 132, 0.6)", // 赤系
          borderColor: "rgba(255, 99, 132, 1)",
          borderWidth: 1
        },
        {
          label: "幼体・不明",
          data: monthlyCountsJuvenile,
          backgroundColor: "rgba(54, 162, 235, 0.6)", // 青系
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: '月'
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: {
            display: true,
            text: '記録数'
          },
          ticks: {
            precision: 0, // 小数点以下を丸めて表示 (整数表示)
            maxTicksLimit: 20, // 最大でも 20個程度の目盛りに制限
          }
        }
      },
      plugins: {
        legend: {
          display: false // Chart.js 本来の凡例は非表示にしておき、チェックボックスで制御
        },
        title: {
          display: true,
          text: '出現期',
          align: 'center',
          font: { size: 16 },
        }
      }
    }
  });
}

// チェックボックスによる表示／非表示の切り替え
function setupChartLegendToggles() {
  const toggleAdult = document.getElementById("toggle-adult");
  const toggleJuvenile = document.getElementById("toggle-juvenile");

  // 成体をON/OFF
  toggleAdult.addEventListener("change", () => {
    if (monthChart) {
      // datasets[0] を成体として想定
      monthChart.data.datasets[0].hidden = !toggleAdult.checked;
      monthChart.update();
    }
  });

  // 幼体・不明をON/OFF
  toggleJuvenile.addEventListener("change", () => {
    if (monthChart) {
      // datasets[1] を幼体・不明として想定
      monthChart.data.datasets[1].hidden = !toggleJuvenile.checked;
      monthChart.update();
    }
  });
}

/**
 * 各都道府県の記録数（科ごとの積み上げ）を生成する関数
 * @param {Array} allRows フィルタ済みのデータ
 */
function generatePrefectureChart(allRows) {
  // すでにチャートが存在する場合は破棄（再生成用）
  if (prefectureChart) {
    prefectureChart.destroy();
  }

  // 未記載種を除外するチェックがONかどうか (filterByCheckboxでも除外される場合は不要)
  const excludeUndescribed = document.getElementById("exclude-undescribed")?.checked;

  // taxonRank === "species" のみ対象
  // 未記載種除外をここで行う場合は、 && で絞り込み
  const speciesRows = allRows.filter(row => {
    // taxonRank が "species" 以外は除外
    if (row.taxonRank !== "species") return false;
    // 「未記載種を除外」がチェックされており、かつ undescribedSpecies が "yes" の場合は除外
    if (excludeUndescribed && row.undescribedSpecies.toLowerCase() === "yes") return false;

    return true;
  });

  // データ構造: 都道府県 × 科 => 「(和名 + 学名)のSet」
  const prefectureFamilySpecies = {};

  // データを走査して「同じ和名+学名」を1種として集計
  speciesRows.forEach(row => {
    const pref = row.prefecture;
    const fam  = row.family;
    // 都道府県やfamilyが空("-")の場合は除外
    if (!pref || pref === "-" || !fam || fam === "-") return;

    // 1種を表すユニークキーを作成
    const uniqueSpeciesKey = `${row.japaneseName}//${row.scientificName}`;

    // 集計用初期化
    if (!prefectureFamilySpecies[pref]) {
      prefectureFamilySpecies[pref] = {};
    }
    if (!prefectureFamilySpecies[pref][fam]) {
      prefectureFamilySpecies[pref][fam] = new Set();
    }

    // 重複チェック込みで1種を登録
    prefectureFamilySpecies[pref][fam].add(uniqueSpeciesKey);
  });

  // 都道府県ごとの合計「種数」が多い順でソート
  const prefTotalArray = Object.keys(prefectureFamilySpecies).map(pref => {
    const familyObj = prefectureFamilySpecies[pref];
    // 各科に格納されている Set の合計サイズを計算
    const totalSpecies = Object.values(familyObj).reduce((sum, setOfSpecies) => sum + setOfSpecies.size, 0);
    return { pref, total: totalSpecies };
  });

  // 降順ソート
  prefTotalArray.sort((a, b) => b.total - a.total);

  // ソート結果から都道府県名を抽出
  const sortedPrefectures = prefTotalArray.map(item => item.pref);

  // 全科 (family) をまとめた配列を作り、アルファベット順などでソート
  const familySet = new Set();
  for (const pref in prefectureFamilySpecies) {
    for (const fam in prefectureFamilySpecies[pref]) {
      familySet.add(fam);
    }
  }
  const families = Array.from(familySet).sort();

  // Chart.js の dataset を作る (科を積み上げ系列に)
  const datasets = families.map((fam, index) => {
    // 都道府県リストと同じ順番で値(種数)を並べる
    const data = sortedPrefectures.map(pref => {
      // 指定のprefに該当のfamがあれば、そのSetのsize。無ければ0
      return prefectureFamilySpecies[pref][fam]?.size || 0;
    });

    // カラー
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
      label: fam,
      data: data,
      backgroundColor: bgColor,
      borderColor: bdColor,
      borderWidth: 1,
      order: families.length - 1 - index
    };
  });

  // **横スクロール用の canvas 幅を調整**
  const canvas = document.getElementById("prefecture-chart");
  const chartWrapper = document.getElementById("prefecture-chart-wrapper");

  const minWidth = 600; // 最低でも 600px 確保
  const barWidth = 40;  // 1都道府県あたりの棒グラフ幅
  const totalWidth = Math.max(minWidth, sortedPrefectures.length * barWidth);
  canvas.style.width = `${totalWidth}px`;
  canvas.width = totalWidth;      // 内部解像度も更新
  canvas.style.height = "920px";
  canvas.height = 920;            // 内部解像度も更新
  chartWrapper.style.overflowX = "auto"; // **スクロール可能にする**

  // Chart.js で描画
  const ctx = canvas.getContext("2d");
  prefectureChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedPrefectures,
      datasets: datasets
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: "都道府県"
          },
          ticks: {
            maxRotation: 90,
            minRotation: 0
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: {
            display: true,
            text: "種数"  // 縦軸ラベルを"種数"に
          },
          ticks: {
            precision: 0,
            maxTicksLimit: 15
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "right", // 凡例を右側に表示
          labels: {
            generateLabels: function (chart) {
              return chart.data.datasets.map((dataset) => {
                const familyName = dataset.label;
                const scientificName = familyName;
                const japaneseName = taxonMap[scientificName]?.japaneseName || "-";
                return {
                  text: `${japaneseName} ${scientificName}`,
                  fillStyle: dataset.backgroundColor,
                  strokeStyle: dataset.borderColor,
                  lineWidth: dataset.borderWidth,
                  datasetIndex: chart.data.datasets.indexOf(dataset)
                };
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const index = context.datasetIndex;
              const familyName = context.chart.data.datasets[index].label;
              const scientificName = familyName;
              const japaneseName = taxonMap[scientificName]?.japaneseName || "-";
              const value = context.raw;
              return `${japaneseName} ${scientificName}: ${value}`;
            }
          }
        },
        title: {
          display: true,
          text: "各都道府県の種数 (科別)",
          align: "center",
          font: { size: 16 }
        }
      }
    }
  });
}

// ==================== UI操作関数 ====================
// 検索部分の開閉
const searchContainer = document.getElementById('searchContainer');
const toggleButton = document.getElementById('toggle-button');

// レコード数と地点数を更新する関数
const updateRecordInfo = (recordCount, locationCount) => {
  document.getElementById("record-count").textContent = recordCount;
  document.getElementById("location-count").textContent = locationCount;
};

// 選択値を表示
const updateSelectedLabels = () => {
  const labelContainer = document.getElementById("selected-labels");
  if (!labelContainer) return;

  // **更新前の位置と高さを取得**
  const previousHeight = labelContainer.clientHeight; // clientHeight に変更

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
    const select = document.getElementById(id);
    if (!select) return "";

    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || !selectedOption.value) return "";

    let labelText = selectedOption.text;

    // 和名と学名の順序を修正
    if (labelText.includes(" / ")) {
      const parts = labelText.split(" / ");
      labelText = `${parts[1]} / ${parts[0]}`;
    }

    // 目・科の学名のフォーマットを適用
    if (id === "filter-order" || id === "filter-family") {
      labelText = formatOrderFamilyName(labelText);
    }

    // 種の学名のフォーマットを適用
    if (id === "filter-species") {
      labelText = formatSpeciesName(labelText);
    }

    // 属の学名部分を斜体にする
    if (id === "filter-genus") {
      labelText = formatGenusName(labelText);
    }

    // 文献の表記をポップアップと統一
    if (id === "filter-literature") {
      const literatureID = selectedOption.value;
      const { literatureName, literatureLink } = getLiteratureInfo(literatureID);
      labelText = literatureLink ? `${literatureName} <a href="${literatureLink}" target="_blank">${literatureLink}</a>` : literatureName;
    }

    // **エスケープ処理（`-`, `[`, `]`）**
    labelText = labelText.replace(/-/g, "&#8209;") // ノーブレークハイフン
                         .replace(/\[/g, "&#91;")
                         .replace(/\]/g, "&#93;");

    return labelText;
  }).filter(label => label !== ""); // 空のラベルを除外

  if (labels.length > 0) {
    labelContainer.innerHTML = labels.join("<br>"); // 改行を適用
    labelContainer.style.display = "block"; // 表示
  } else {
    // ラベルがないときは内容を消去＆非表示
    labelContainer.innerHTML = "";
    labelContainer.style.display = "none";
  }

  // **更新後の高さを取得**
  const newHeight = labelContainer.clientHeight; // clientHeight に変更
  const heightDifference = newHeight - previousHeight;

  if (heightDifference !== 0) {
    window.scrollTo({
      top: window.scrollY + heightDifference,
      behavior: "instant"
    });
  }
};

// 目・科の学名のフォーマット処理
const formatOrderFamilyName = (name) => {
  if (!name.includes(" / ")) return name;

  let [japaneseName, scientificName] = name.split(" / ");
  
  // taxonMap からデータを取得
  const taxonInfo = taxonMap[scientificName] || { japaneseName: "-", authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;

  // 目・科の学名は通常フォント
  return `${taxonInfo.japaneseName} / <span class="non-italic">${scientificName}</span>${authorYear}`;
};

// 属の学名部分を斜体にする関数
const formatGenusName = (name) => {
  if (!name.includes(" / ")) return name;

  let [japaneseName, scientificName] = name.split(" / ");
  
  // taxonMap からデータを取得
  const taxonInfo = taxonMap[scientificName] || { japaneseName: "-", authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;

  // 学名を斜体にし、著者・年は通常フォント
  return `${taxonInfo.japaneseName} / <i>${scientificName}</i>${authorYear}`;
};

// 種の学名のフォーマット処理
const formatSpeciesName = (name) => {
  if (!name.includes(" / ")) return name; // 「/」が含まれていなければそのまま返す

  let [japaneseName, scientificName] = name.split(" / ");
  let formattedScientificName = scientificName;

  // カッコ () を通常フォントにする
  formattedScientificName = formattedScientificName.replace(/\(/g, '<span class="non-italic">(</span>');
  formattedScientificName = formattedScientificName.replace(/\)/g, '<span class="non-italic">)</span>');

  // iタグなしのscientificNameを作成
  const cleanScientificName = scientificName.replace(/<\/?i>/g, "").trim();

  // taxonMap から authorYear を取得
  const taxonInfo = taxonMap[cleanScientificName] || { authorYear: "-" };
  const authorYear = taxonInfo.authorYear === "-" ? "" : ` <span class="non-italic">${taxonInfo.authorYear}</span>`;

  // ord. / fam. / gen. を含む場合は斜体なし
  if (formattedScientificName.match(/ord\.|fam\.|gen\./)) {
    return `${japaneseName} / <span class="non-italic">${formattedScientificName}</span>${authorYear}`;
  }

  // sp. を含み、ord. / fam. / gen. が含まれない場合
  if (formattedScientificName.includes("sp.") && !formattedScientificName.match(/ord\.|fam\.|gen\./)) {
    formattedScientificName = formattedScientificName.replace(/(.*?)(sp\..*)/, '<i>$1</i><span class="non-italic">$2</span>');
  } else {
    // それ以外の場合はすべて斜体
    formattedScientificName = `<i>${formattedScientificName}</i>`;
  }

  return `${japaneseName} / ${formattedScientificName}${authorYear}`;
};

// 疑わしい記録のチェックボックス間の連動
function linkMasterAndDubiousCheckboxes() {
  // ▼ レジェンド側チェックボックス
  const masterCheckbox = document.getElementById("legend-master-checkbox");
  const filterDoubtfulType = document.getElementById("filter-doubtful-type");
  const filterDoubtfulIntegrated = document.getElementById("filter-doubtful-integrated-type");
  const filterDoubtfulLiterature = document.getElementById("filter-doubtful-literature");

  // ▼ サーチコンテナ側
  const excludeDubious = document.getElementById("exclude-dubious");

  // 存在チェック
  if (!masterCheckbox || !filterDoubtfulType || !filterDoubtfulIntegrated || !filterDoubtfulLiterature || !excludeDubious) {
    console.warn("疑わしいチェックボックス、マスター、exclude-dubious のいずれかが見つかりません。");
    return;
  }

  // ------------------------------------------
  // 1) 「疑わしい系」のチェック状態をまとめて判定する関数
  // ------------------------------------------
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

  // ------------------------------------------
  // 2) excludeDubious が変わったときの動作
  // ------------------------------------------
  excludeDubious.addEventListener("change", () => {
    if (excludeDubious.checked) {
      // 「疑わしい系」はすべて OFF にする
      filterDoubtfulType.checked = false;
      filterDoubtfulIntegrated.checked = false;
      filterDoubtfulLiterature.checked = false;
    }
    else {
      // チェックが外れた時は、疑わしいタイプ・統合された種の疑わしいタイプ・疑わしい記録すべてONにする
      filterDoubtfulType.checked = true;
      filterDoubtfulIntegrated.checked = true;
      filterDoubtfulLiterature.checked = true;
    }
    // 状況に応じて applyFilters を実行して地図等を更新
    applyFilters();
  });

  // ------------------------------------------
  // 3) 「疑わしい系」 3チェックボックスのいずれかが変わったら
  // ------------------------------------------
  const onDubiousCheckboxChange = () => {
    if (areAnyDubiousOn()) {
      // 1つでもONなら excludeDubiousをOFFに
      excludeDubious.checked = false;
    } else {
      // 全部OFFになったら excludeDubiousをONに
      excludeDubious.checked = true;
    }
    applyFilters();
  };

  filterDoubtfulType.addEventListener("change", onDubiousCheckboxChange);
  filterDoubtfulIntegrated.addEventListener("change", onDubiousCheckboxChange);
  filterDoubtfulLiterature.addEventListener("change", onDubiousCheckboxChange);

  // ------------------------------------------
  // 4) masterCheckbox が変わったとき
  //    => 全チェックをON/OFF する基本処理を行った後、
  //    => 「疑わしい系」の結果に応じて excludeDubious を同期する
  // ------------------------------------------
  masterCheckbox.addEventListener("change", () => {
    const masterOn = masterCheckbox.checked;

    // 全マーカー種別チェックを masterOn に合わせる例
    // （疑わしい系だけでなく、他のフィルタ checkBox の場合も全チェックするなら以下を拡張）
    const markerFilterCheckboxes = document.querySelectorAll(".marker-filter-checkbox");
    markerFilterCheckboxes.forEach(cb => {
      cb.checked = masterOn;
    });

    // 「疑わしい系」は上記ループでON/OFFされたので、最後に excludeDubious と同期
    if (areAllDubiousOff()) {
      // すべてOFF => excludeDubious = ON
      excludeDubious.checked = true;
    } else {
      // 1つでもON => excludeDubious = OFF
      excludeDubious.checked = false;
    }

    applyFilters();
  });

  // ------------------------------------------
  // 5) 初期同期
  // ------------------------------------------
  // マスターがONなら、.marker-filter-checkboxを全てONにするか
  // OFFなら全てOFFにするなど、既存の初期処理を行う場合はここでも実行可能
  
  // まず、疑わしい系がすべてOFFなら excludeDubious=ON, いずれかONなら excludeDubious=OFF
  if (areAllDubiousOff()) {
    excludeDubious.checked = true;
  } else {
    excludeDubious.checked = false;
  }

  // （必要に応じて applyFilters() を呼ぶ）
}

// ==================== マーカー操作 ====================
// recordTypeに基づいてマーカーのスタイルを設定
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

// マーカーをクリアする関数
const clearMarkers = () => {
  markers.forEach(marker => marker.remove());
  markers = [];

  if (map.getSource("clusters")) {
    map.removeLayer("clusters");
    map.removeLayer("cluster-count");
    map.removeLayer("unclustered-point");
    map.removeSource("clusters");
  }
};

// フィルターされたデータをマーカーとして表示
const displayMarkers = (filteredData) => {
  clearMarkers();
  filteredRows = filteredData; // フィルタリングされたデータを更新

  const priority = {
      "1_タイプ産地": 7,
      "2_統合された種のタイプ産地": 6,
      "3_疑わしいタイプ産地": 5,
      "4_疑わしい統合された種のタイプ産地": 4,
      "5_標本記録": 3,
      "6_文献記録": 2,
      "7_疑わしい文献記録": 1
  };

  const selectedMarkers = [];

  // 地図の表示範囲から 1px あたりの緯度・経度変換比率を計算
  const mapBounds = map.getBounds();
  const mapWidth = map.getContainer().offsetWidth;
  const mapHeight = map.getContainer().offsetHeight;

  const pixelRatioLng = Math.abs(mapBounds._ne.lng - mapBounds._sw.lng) / mapWidth; // 1px あたりの経度変換比率
  const pixelRatioLat = Math.abs(mapBounds._ne.lat - mapBounds._sw.lat) / mapHeight; // 1px あたりの緯度変換比率
  const thresholdLng = pixelRatioLng * 5; // **5px 相当の経度の変化**
  const thresholdLat = pixelRatioLat * 5; // **5px 相当の緯度の変化**

  filteredData.forEach(row => {
      if (!row.latitude || !row.longitude) return;

      // すでに登録済みのマーカーと比較し、半径2px以内にあるか確認
      let isNearby = false;
      let nearbyIndex = -1;

      for (let i = 0; i < selectedMarkers.length; i++) {
          const existingMarker = selectedMarkers[i];

          if (
              Math.abs(existingMarker.latitude - row.latitude) <= thresholdLat &&
              Math.abs(existingMarker.longitude - row.longitude) <= thresholdLng
          ) {
              isNearby = true;
              nearbyIndex = i;
              break;
          }
      }

      if (isNearby) {
          // 既存のマーカーと競合がある場合、優先度の高いものだけを残す
          if (priority[row.recordType] > priority[selectedMarkers[nearbyIndex].recordType]) {
              selectedMarkers[nearbyIndex] = row;
          }
      } else {
          // 近くにない場合、新規登録
          selectedMarkers.push(row);
      }
  });

  // **優先順位の高いものを後に追加する**
  const sortedMarkers = selectedMarkers.sort((a, b) => priority[a.recordType] - priority[b.recordType]);

  // ツールチップ用の要素を作成（既に存在しない場合のみ）
  let tooltip = document.querySelector(".marker-tooltip");
  if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "marker-tooltip";
      tooltip.textContent = "クリックで詳細表示";
      document.body.appendChild(tooltip);
  }

  let isTouchDevice = false; // タッチデバイスかどうか判定

  sortedMarkers.forEach(row => {
      const { className, color, borderColor } = getMarkerStyle(row.recordType);

      const el = document.createElement('div');
      el.className = `${className} marker-clickable`;
      el.style.backgroundColor = color;
      if (borderColor) el.style.borderColor = borderColor;

      const marker = new maplibregl.Marker(el)
          .setLngLat([row.longitude, row.latitude])
          .addTo(map);

      // マーカーのホバー時にツールチップを表示（タッチデバイスでは無効）
      el.addEventListener("mouseenter", (event) => {
          if (!isTouchDevice) { // タッチデバイスではない場合のみ表示
              tooltip.style.display = "block";
              tooltip.style.left = `${event.pageX + 10}px`; // マウス位置の右側に表示
              tooltip.style.top = `${event.pageY + 10}px`;
          }
      });

      // マーカーのマウス移動時にツールチップの位置を更新（タッチデバイスでは無効）
      el.addEventListener("mousemove", (event) => {
          if (!isTouchDevice) {
              tooltip.style.left = `${event.pageX + 10}px`;
              tooltip.style.top = `${event.pageY + 10}px`;
          }
      });

      // マーカーからマウスが離れたらツールチップを非表示にする
      el.addEventListener("mouseleave", () => {
          tooltip.style.display = "none";
      });

      // タッチデバイスの場合、タップされたらホバーを無効化
      el.addEventListener("touchstart", () => {
          isTouchDevice = true; // タッチデバイスと判定
          tooltip.style.display = "none"; // ツールチップを非表示
      });

      // クリックイベントの追加
      el.addEventListener("click", () => handleMarkerClick(marker, row));

      markers.push(marker);
  });
};

// ポップアップを準備
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
    if (!row.latitude || !row.longitude) return null; // 緯度・経度がない場合はスキップ

    const { literatureName, literatureLink } = getLiteratureInfo(row.literatureID);
    const recordType = recordTypeMapping[row.recordType] || "不明";

    // ポップアップの内容を生成
    let popupContent = `
      <strong>${row.japaneseName} ${row.scientificName}</strong><br>
      記録の種類: ${recordType}<br>
    `;

    if (!row.literatureID || row.literatureID === "-") {
      popupContent += `未公表データ Unpublished Data`;
    } else {
      popupContent += `
        文献中の和名: ${row.originalJapaneseName || "不明"}<br>
        文献中の学名: ${row.originalScientificName || "不明"}<br>
        ページ: ${row.page || "不明"}<br>
        場所: ${row.location || "不明"}<br>
        採集日: ${row.date || "不明"}<br>
        採集者: ${row.collectorJp || "不明"}<br>
        collector: ${row.collectorEn || "不明"}<br><br>
        文献: ${literatureName} ${literatureLink ? `<a href="${literatureLink}" target="_blank">${literatureLink}</a>` : ""}<br><br>
        備考: ${row.note}<br>
        記入: ${row.registrant}, ${row.registrationDate}
      `;
    }

    return { row, popupContent };
  }).filter(item => item !== null);

  return { popupContents };
};

// ドロップダウンの選択時のリスナー
const setupDropdownListeners = () => {
  const dropdowns = [
    "filter-species",
    "filter-genus",
    "filter-family",
    "filter-order",
    "filter-prefecture",
    "filter-island",
    "filter-literature"
  ];

  dropdowns.forEach((id) => {
    const element = document.getElementById(id);

    // セレクトボックスがクリックされたとき
    element.addEventListener("mousedown", () => {
      element.value = ""; // 選択値を空にする
      applyFilters("", false, useSearch); // フィルタリングを実行：フィルタリングは""による，地図に反映無効，検索窓によるフィルタリング無効
    });

    // セレクトボックスがフォーカスを失った場合（例: 外部をクリックした場合）
    element.addEventListener("blur", () => {
      applyFilters("", true, useSearch); // フィルタリングを実行：フィルタリングは""による，地図に反映有効，検索窓によるフィルタリング無効
      updateSelectedLabels(); // 選択ラベルを更新
    });

    // ドロップダウンから値が選択されたとき
    element.addEventListener("change", () => {
      useSearch = false; // 検索窓のフィルタリングを無効化
      applyFilters("", true, false); // フィルタリングを実行：フィルタリングは""による，地図に反映有効，検索窓によるフィルタリング無効
      updateSelectedLabels(); // 選択ラベルを更新
    });
  });
};

// ドロップダウンを未選択にリセットする関数
const clearDropdowns = () => {
  const dropdowns = [
    "filter-species",
    "filter-genus",
    "filter-family",
    "filter-order",
    "filter-prefecture",
    "filter-island",
  ];

  dropdowns.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.selectedIndex = 0; // ドロップダウンを未選択にリセット
    } else {
      console.warn(`ドロップダウン ${id} が見つかりません`);
    }
  });
};

// リセットボタンの動作
const setupResetButton = () => {
  const resetButton = document.getElementById("reset-button");

  resetButton.addEventListener("click", async () => {
    try {
      // 検索窓の値をリセット
      clearSearch();

      // セレクトボックスをリセット
      const dropdowns = [
        "filter-species",
        "filter-genus",
        "filter-family",
        "filter-order",
        "filter-prefecture",
        "filter-island",
        "filter-literature"
      ];

      dropdowns.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.selectedIndex = 0; // セレクトボックスを未選択状態にする
        } else {
          console.warn(`セレクトボックス ${id} が見つかりません`);
        }
      });

      clearMarkers(); // 地図のマーカーをクリア
      updateSelectedLabels(); // 選択ラベルを更新

      // チェックボックスの状態を維持しつつフィルタを再適用
      applyFilters();
    } catch (error) {
      console.error("リセット処理中にエラーが発生しました:", error);
    }
  });
};

// ツールチップ用の要素を作成し、body に追加
const tooltip = document.createElement("div");
tooltip.className = "marker-tooltip";
tooltip.textContent = "クリックで詳細表示";
document.body.appendChild(tooltip);

// ==================== 地図の初期化とデータロード ====================
const initializeMap = async () => {
  initMap();

  // 各種データをロード
  await loadTaxonNameCSV();
  loadOrderCSV("Prefecture.csv", prefectureOrder);
  loadOrderCSV("Island.csv", islandOrder);
  await loadLiteratureCSV();
  await loadDistributionCSV();

  // 初期データの記録数と地点数を表示
  updateRecordInfo(rows.length, new Set(rows.map(row => `${row.latitude},${row.longitude}`)).size);

  // ドロップダウンとリセットボタンを設定
  setupDropdownListeners();
  setupResetButton();

  // 地図のズームレベル変更時にマーカーを更新
  map.on("zoomend", () => displayMarkers(filteredRows));

  // 初期フィルタリング実行
  applyFilters("", true, false);
};

// ==================== イベントリスナー設定 ====================
const setupEventListeners = () => {
  setupSearchListeners();
  setupCheckboxListeners();
  setupNavigationButtons();
  setupLegendToggle();
  setupPopupClose();
  setupSearchContainerToggle();
};

// 検索ボタンとクリアボタンのイベントを設定
const setupSearchListeners = () => {
  document.getElementById("search-button").addEventListener("mousedown", (event) => {
    event.preventDefault(); // ボタンのクリック処理を妨げないようにする

    // スマホでキーボードを閉じるために検索窓のフォーカスを外す
    document.getElementById("search-all").blur();

    useSearch = true;
    const searchValue = getSearchValue();
    clearDropdowns();
    applyFilters(searchValue, true, true);
  });

  document.getElementById("clear-search-button").addEventListener("mousedown", (event) => {
    event.preventDefault(); // ボタンのクリック処理を妨げないようにする

    // スマホでキーボードを閉じるために検索窓のフォーカスを外す
    document.getElementById("search-all").blur();

    clearSearch();
    applyFilters("", true, true);
  });
};

// チェックボックスのイベントを設定
const setupCheckboxListeners = () => {
  document.getElementById("exclude-unpublished").addEventListener("change", applyFilters);
  document.getElementById("exclude-dubious").addEventListener("change", applyFilters);
  document.getElementById("exclude-citation").addEventListener("change", applyFilters);
  document.getElementById("exclude-undescribed").addEventListener("change", applyFilters);
  document.getElementById("exclude-unspecies").addEventListener("change", applyFilters);

  document.querySelectorAll(".marker-filter-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", applyFilters);
  });
};

// 前・次ボタンのイベントを設定
const setupNavigationButtons = () => {
  setupNavButtonListeners();
};

// 凡例 (Legend) のトグルボタンを設定
const setupLegendToggle = () => {
  const legend = document.querySelector(".legend");
  const legendToggleButton = document.querySelector(".legend-toggle-button");

  legendToggleButton.addEventListener("click", () => {
    legend.classList.toggle("collapsed");
  });
};

// ポップアップの外をクリックすると閉じる
const setupPopupClose = () => {
  document.addEventListener("click", (event) => {
    if (!activePopup) return;

    const popupElements = document.querySelectorAll(".maplibregl-popup");
    const isInsidePopup = [...popupElements].some(popup => popup.contains(event.target));

    if (!isInsidePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }, true);
};

// サーチコンテナのトグル処理
const setupSearchContainerToggle = () => {
  const searchContainer = document.querySelector(".search-container");
  const toggleButton = document.getElementById("toggle-button");

  toggleButton.addEventListener("click", () => {
    searchContainer.classList.toggle("closed");
    toggleButton.classList.toggle("rotate");
  });
};

// ==================== サーチコンテナの配置調整 ====================
let preventResize = false;

// ウィンドウ幅の変更にともなう表示の調整
const adjustSearchContainerAndLegend = () => {
  if (preventResize) return;

  const searchContainer = document.querySelector(".search-container");
  const mapContainer = document.getElementById("mapid");
  const legend = document.querySelector(".legend");
  const selectedLabels = document.getElementById("selected-labels");

  if (window.innerWidth <= 711) {
    const paddingValue = parseInt(window.getComputedStyle(searchContainer).paddingLeft, 10) || 0;
    searchContainer.style.position = "relative";
    searchContainer.style.width = `${mapContainer.offsetWidth - (paddingValue * 2)}px`;
    selectedLabels?.insertAdjacentElement("afterend", searchContainer);

    // トグルボタンの位置を調整
    const toggleButton = document.getElementById("toggle-button");
    toggleButton.style.right = "10px";
    toggleButton.style.top = "10px";
    toggleButton.style.bottom = "auto"; // 右下の設定を解除

    // legend を mapid の下に配置し、幅を mapid に合わせる
    if (legend.parentNode !== mapContainer.parentNode) {
      mapContainer.insertAdjacentElement("afterend", legend); // すでに移動済みでなければ移動
    }
    legend.style.position = "relative";
    legend.style.width = `${mapContainer.offsetWidth}px`;
    legend.style.bottom = "auto";  // 元の設定を解除
    legend.style.right = "auto";   // 元の設定を解除
  } else {
    searchContainer.style.position = "absolute";
    searchContainer.style.width = "auto";
    mapContainer.appendChild(searchContainer);

    // トグルボタンを元の位置に戻す
    const toggleButton = document.getElementById("toggle-button");
    toggleButton.style.right = "10px";
    toggleButton.style.bottom = "10px";
    toggleButton.style.top = "auto";

    // legend の位置と幅をデフォルトに戻す
    if (legend.parentNode !== mapContainer) {
      mapContainer.appendChild(legend); // すでに移動済みでなければ戻す
    }
    legend.style.position = "absolute";
    legend.style.width = "340px";
    legend.style.bottom = "30px";
    legend.style.right = "10px";
  }
};

// 検索窓のフォーカス時にレイアウト変更を防ぐ
document.getElementById("search-all").addEventListener("focus", () => {
  preventResize = true;
});

document.getElementById("search-all").addEventListener("blur", () => {
  preventResize = false;
  adjustSearchContainerAndLegend();
});

// ウィンドウサイズ変更時にサーチコンテナを調整
window.addEventListener("resize", adjustSearchContainerAndLegend);

// ==================== イベントリスナーの設定 ====================

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeMap();
    setupEventListeners();
    adjustSearchContainerAndLegend();
    setupChartLegendToggles();
    linkMasterAndDubiousCheckboxes();

    // 全選択チェックボックスの処理
    const masterCheckbox = document.getElementById("legend-master-checkbox");
    const allCheckboxes = document.querySelectorAll(".marker-filter-checkbox");

    masterCheckbox.addEventListener("change", () => {
      allCheckboxes.forEach(checkbox => {
        checkbox.checked = masterCheckbox.checked;
      });
      applyFilters(); // チェックが変更されたら地図を更新
    });

    // 個別チェックボックスが変更されたときにマスターの状態を確認
    allCheckboxes.forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        masterCheckbox.checked = [...allCheckboxes].every(cb => cb.checked);
      });
    });

    // ここからタブの処理
    const tabHeaderItems = document.querySelectorAll(".tab-header li");
    const tabContents = document.querySelectorAll(".tab-content");
  
    tabHeaderItems.forEach(item => {
      item.addEventListener("click", () => {
        // 1) すべてのタブ見出しとタブ内容から active を外す
        tabHeaderItems.forEach(i => i.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
  
        // 2) クリックしたタブを active にし、対応するコンテンツを表示
        item.classList.add("active");
        const targetTabId = item.getAttribute("data-tab");
        const targetTabContent = document.getElementById(targetTabId);
        targetTabContent.classList.add("active");
      });
    });

  } catch (error) {
    console.error("初期化中にエラーが発生:", error);
  }
});
