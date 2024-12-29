let map; // 地図オブジェクトをグローバル変数として宣言
// データの初期化
let rows = [];
let combinedNames = [];
let taxonMap = {}; // TaxonName.csvから取得したマッピング
let prefectureOrder = [];
let islandOrder = [];
let searchActive = false; // 検索窓が有効かどうか
let markers = []; // マーカーを追跡する配列
let literatureMap = new Map(); // 文献データを保持するマップ

// 検索部分の開閉
const searchContainer = document.getElementById('searchContainer');
const toggleButton = document.getElementById('toggle-button');

// 最初にsearchContainerが開いている状態とする
let isOpen = true;

// toggleButtonにクリックイベントを追加
toggleButton.addEventListener('click', () => {
  if (isOpen) {
    // searchContainerを閉じる
    searchContainer.classList.add('closed');
    toggleButton.classList.add('rotate');  // 三角形を回転
  } else {
    // searchContainerを再表示
    searchContainer.classList.remove('closed');
    toggleButton.classList.remove('rotate');  // 三角形を元に戻す
  }
  // isOpenの状態を切り替え
  isOpen = !isOpen;
});

// 地図の初期設定
const initMap = () => {
  map = new maplibregl.Map({
    container: 'mapid',
    style: {
      "version": 8,
      "sources": {
        "japan": {
          "type": "geojson", // GeoJSON形式で読み込むため変換後のデータを使用
          "data": null,      // 後でTopoJSONをGeoJSONに変換してセット
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
    zoom: 4,
    maxZoom: 9,
    minZoom: 4
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');
};

// TopoJSONをGeoJSONに変換してマップに追加
const loadTopoJSON = async () => {
  try {
    const response = await fetch("Japan.json"); // TopoJSONファイルを読み込む
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const topojsonData = await response.json();

    // TopoJSONをGeoJSONに変換
    const geojsonData = topojson.feature(topojsonData, topojsonData.objects[Object.keys(topojsonData.objects)[0]]);

    // マップにGeoJSONデータをセット
    map.getSource('japan').setData(geojsonData);
  } catch (error) {
    console.error("TopoJSONの読み込みエラー:", error);
  }
};

// DOMContentLoaded後に地図とデータをロード
document.addEventListener("DOMContentLoaded", async () => {
  initMap();      // 地図を初期化
  await loadTopoJSON(); // TopoJSONデータをロード
});

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

      // グローバルスコープの literatureMap を初期化
      literatureMap = [];

      const lines = csvText.split("\n").filter(line => line.trim());

      // データ解析（URL情報を追加）
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
              literatureMap.push({ 
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
      const [japaneseName, scientificName] = line.split(",").map(col => col.trim());
      taxonMap[scientificName] = japaneseName || "-"; // 和名がない場合"-"を表示
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

// 値が "-" の場合、リストの最後に配置
const sortOptions = (options) => {
  return options.sort((a, b) => {
    if (a.value === "-") return 1;
    if (b.value === "-") return -1;
    return a.value.localeCompare(b.value);
  });
};

// 検索窓を消去する関数
const clearSearch = () => {
  document.getElementById("search-all").value = "";
};

// レコード数と地点数を更新する関数
const updateRecordInfo = (recordCount, locationCount) => {
  document.getElementById("record-count").textContent = recordCount;
  document.getElementById("location-count").textContent = locationCount;
};

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
};

/// フィルタリングされたデータをマーカーとして表示
const displayMarkers = (filteredData) => {

    clearMarkers(); // 古いマーカーを削除

    // 文献タイトルリストを準備
    const literatureTitles = [];

    filteredData.forEach(row => {
        if (!row.latitude || !row.longitude) return; // 緯度・経度がない場合はスキップ

        const { className, color, borderColor } = getMarkerStyle(row.recordType);
        const el = document.createElement('div');
        el.className = `${className} marker-clickable`; // クリック可能なクラスを追加
        el.style.backgroundColor = color;
        if (borderColor) el.style.borderColor = borderColor;

        // 文献IDを取得
        const literatureItem = literatureMap.find(item => item.id === row.literatureID);
        const literatureTitle = literatureItem ? literatureItem.label : "不明";
        const literatureLink = literatureItem?.link ? `<a href="${literatureItem.link}" target="_blank">${literatureItem.link}</a>` : "リンクなし";

        // 文献タイトルを配列に追加（重複排除）
        if (literatureTitle !== "不明" && !literatureTitles.includes(literatureTitle)) {
            literatureTitles.push(literatureTitle);
        }

        // ポップアップの内容を動的に生成
        let popupContent;

        // 文献情報がある場合はリンクを表示
        if (!row.literatureID || row.literatureID === "-") {
          popupContent = `
            <strong>${row.japaneseName} ${row.scientificName}</strong><br>
            未公表データ Unpublished Data
          `;
        } else {
            popupContent = `
                <strong>${row.japaneseName} ${row.scientificName}</strong><br>
                文献中の和名: ${row.originalJapaneseName || "不明"}<br>
                文献中の学名: ${row.originalScientificName || "不明"}<br>
                ページ: ${row.page || "不明"}<br>
                場所: ${row.location || "不明"}<br>
                採集日: ${row.date || "不明"}<br><br>
                文献: ${literatureTitle} ${literatureLink}<br><br>
                備考: ${row.note}<br>
                記入: ${row.registrant}, ${row.registrationDate}
            `;
        }

        popupContent = popupContent.replace(/<i>(.*?)<\/i>/g, (_, match) => `<i>${match}</i>`);

        const marker = new maplibregl.Marker(el)
            .setLngLat([row.longitude, row.latitude])
            .setPopup(new maplibregl.Popup().setHTML(popupContent))
            .addTo(map);

        markers.push(marker);
    });

    // 文献リストを更新
    updateLiteratureList(literatureTitles);

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
  const orderedLiterature = literatureMap.filter(item => titles.includes(item.label));

  const ol = document.createElement('ol');
  orderedLiterature.forEach(item => {
      const li = document.createElement('li');
      let listItem = item.label; // 文献タイトル

      // URLがある場合、リンクを追加
      if (item.link) {
          listItem += ` <a href="${item.link}" target="_blank">${item.link}</a>`;
      }

      li.innerHTML = listItem; // HTMLタグを含むタイトルをそのまま挿入
      ol.appendChild(li);
  });

  listContainer.appendChild(ol);
};

// フィルタ選択肢を更新
const updateFilters = (filteredData, filters) => {
  const searchValue = document.getElementById("search-all").value.toLowerCase();

  // チェックボックスの状態を取得
  const excludeUnpublished = document.getElementById("exclude-unpublished").checked;
  const excludeDubious = document.getElementById("exclude-dubious").checked;
  const excludeCitation = document.getElementById("exclude-citation").checked;

  // チェックボックスでの絞り込みを適用
  const checkboxFilteredData = filteredData.filter(row => {
    const isUnpublished = row.literatureID === "-" || row.literatureID === "";
    const isDubious = ["3_疑わしいタイプ産地", "4_疑わしい統合された種のタイプ産地", "7_疑わしい文献記録"].includes(row.recordType);
    //console.log(rows.map(row => row.original));
    const isCitation = row.original === "-";

    if (excludeUnpublished && isUnpublished) return false;
    if (excludeDubious && isDubious) return false;
    if (excludeCitation && isCitation) return false;

    return true; // チェックボックスで除外されないデータを保持
  });

  // 文献セレクトボックスのフィルタリング
  const literatureOptions = literatureMap
    .filter(item =>
      checkboxFilteredData.some(row => row.literatureID === item.id) && // データ中に存在する文献IDのみ
      item.label.toLowerCase().includes(searchValue) // 検索窓のテキストが含まれる場合
    )
    .map(item => ({
      value: item.id,
      label: item.label
    }));

  // 文献セレクトボックスを更新
  populateSelect("filter-literature", literatureOptions, "文献を選択", filters.literature);

  // 検索窓の内容に基づいて他の選択肢を更新
  combinedNames = [...new Set(checkboxFilteredData.map(row => `${row.scientificName} / ${row.japaneseName}`))]
    .filter(name => name.toLowerCase().includes(searchValue))
    .sort();

  const selectedPrefecture = filters.prefecture;
  const selectedIsland = filters.island;

  const prefectureOptions = prefectureOrder.map(prefecture => ({
    value: prefecture,
    label: prefecture
  })).filter(option => {
    return checkboxFilteredData.some(row =>
      row.prefecture === option.value &&
      option.label.toLowerCase().includes(searchValue)
    );
  });

  const islandOptions = islandOrder.map(island => ({
    value: island,
    label: island
  })).filter(option => {
    return checkboxFilteredData.some(row =>
      row.island === option.value &&
      option.label.toLowerCase().includes(searchValue)
    );
  });

  const getOptions = (key, dataKey) => {
    const options = [...new Map(checkboxFilteredData.map(row => [
      row[dataKey],
      { value: row[dataKey], label: `${row[dataKey]} / ${taxonMap[row[dataKey]] || "-"}` } // 和名がない場合"-"を表示
    ])).values()];

    return options
      .filter(option => option.label.toLowerCase().includes(searchValue))
      .sort((a, b) => {
        if (a.value === "-") return 1;
        if (b.value === "-") return -1;
        return a.value.localeCompare(b.value);
      });
  };

  // 各セレクトボックスを更新
  populateSelect("filter-species", combinedNames.map(name => ({ value: name, label: name })), "種を選択", filters.species);
  populateSelect("filter-genus", getOptions("genus", "genus"), "属を選択", filters.genus);
  populateSelect("filter-family", getOptions("family", "family"), "科を選択", filters.family);
  populateSelect("filter-order", getOptions("order", "order"), "目を選択", filters.order);
  populateSelect("filter-prefecture", prefectureOptions, "都道府県を選択", selectedPrefecture);
  populateSelect("filter-island", islandOptions, "島を選択", selectedIsland);
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

    // ドロップダウンがクリックされたとき
    element.addEventListener("mousedown", () => {
      // previousValue = element.value; // 現在の値を記録
      element.value = ""; // 選択値を空にする
      applyFilters(); // 地図を更新
    });

    // ドロップダウンから値が選択されたとき
    element.addEventListener("change", () => {
      applyFilters(); // 地図を更新
    });

  });
};

// 文献セレクト要素を動的に作成
const createLiteratureSelect = () => {
  const options = literatureMap.map(item => ({
    value: item.id,
    label: item.label
  }));

  // セレクトボックスを初期化
  populateSelect("filter-literature", options, "文献を選択", "");
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

      // 地図のマーカーをクリア
      clearMarkers();

      // チェックボックスの状態を維持しつつフィルタを再適用
      applyFilters();
    } catch (error) {
      console.error("リセット処理中にエラーが発生しました:", error);
    }
  });
};

// 全フィルタリングを適用
const applyFilters = async (excludeDropdownId = null, updateMap = true) => {
  try {
    // 各セレクトボックスの現在の選択値を取得
    const filters = {
      species: document.getElementById("filter-species").value,
      genus: document.getElementById("filter-genus").value,
      family: document.getElementById("filter-family").value,
      order: document.getElementById("filter-order").value,
      prefecture: document.getElementById("filter-prefecture").value,
      island: document.getElementById("filter-island").value,
      literature: document.getElementById("filter-literature").value,
    };

    // チェックボックスの状態を取得
    const excludeUnpublished = document.getElementById("exclude-unpublished").checked;
    const excludeDubious = document.getElementById("exclude-dubious").checked;
    const excludeCitation = document.getElementById("exclude-citation").checked;

    // フィルタがすべて未選択の場合
    const allFiltersEmpty = Object.values(filters).every(value => value === "");
    if (allFiltersEmpty) {
      // チェックボックスを考慮してすべてのレコードをフィルタリング
      const filteredRows = rows.filter(row => {
        const isUnpublished = row.literatureID === "-" || row.literatureID === "";
        const isDubious = ["3_疑わしいタイプ産地", "4_疑わしい統合された種のタイプ産地", "7_疑わしい文献記録"].includes(row.recordType);
        const isCitation = row.original === "no";

        if (excludeUnpublished && isUnpublished) return false; // 未公表データを除外
        if (excludeDubious && isDubious) return false; // 疑わしいデータを除外
        if (excludeCitation && isCitation) return false; // 引用記録を除外

        return true; // 除外条件を満たさないデータを保持
      });

      // フィルタリング後のレコード数と地点数を計算
      const totalRecordCount = filteredRows.length;
      const totalLocationCount = new Set(filteredRows.map(row => `${row.latitude},${row.longitude}`)).size;

      // レコード数と地点数を更新
      updateRecordInfo(totalRecordCount, totalLocationCount);

      // マーカーは表示しない
      clearMarkers();
      updateLiteratureList([]); // 文献リストをクリア
      updateFilters(rows, filters); // フィルタ状態を更新
      return;
    }

    // フィルタリング条件を満たす行を抽出
    const filteredRows = rows.filter(row => {
      const combinedName = `${row.scientificName} / ${row.japaneseName}`;
      const isUnpublished = row.literatureID === "-" || row.literatureID === "";
      const isDubious = ["3_疑わしいタイプ産地", "4_疑わしい統合された種のタイプ産地", "7_疑わしい文献記録"].includes(row.recordType);
      const isCitation = row.original === "no";

      if (excludeUnpublished && isUnpublished) return false; // 未公表データを除外
      if (excludeDubious && isDubious) return false; // 疑わしいデータを除外
      if (excludeCitation && isCitation) return false; // 引用記録を除外

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

    // 各セレクトボックスを更新
    updateFilters(filteredRows, filters);

    // レコード数と地点数を更新
    const recordCount = filteredRows.length;
    const locationCount = new Set(filteredRows.map(row => `${row.latitude},${row.longitude}`)).size;
    updateRecordInfo(recordCount, locationCount);

    // 地図のマーカーを更新
    if (updateMap) {
      displayMarkers(filteredRows);
    }
  } catch (error) {
    console.error("applyFilters中にエラーが発生:", error);
  }
};

// GeoJSON を読み込む
const loadGeoJSON = async () => {
  try {
    const response = await fetch("DistributionRecord_web.geojson");
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    const geojson = await response.json();

    rows = geojson.features.map(feature => {
      const props = feature.properties;
      return {
        recordType: typeof props["記録の分類_タイプ産地or標本記録or文献記録or疑わしいかどうか"] === "string" ? props["記録の分類_タイプ産地or標本記録or文献記録or疑わしいかどうか"].trim() : "-",
        japaneseName: typeof props["和名"] === "string" ? props["和名"].trim() : "-",
        scientificName: typeof props["学名"] === "string" ? props["学名"].trim() : "-",
        latitude: props["Latitude_assumed"] || null,
        longitude: props["Longitude_assumed"] || null,
        date: typeof props["日付"] === "string" ? props["日付"].trim() : "-",
        prefecture: typeof props["都道府県_jp"] === "string" ? props["都道府県_jp"].trim() : "-",
        island: typeof props["島_jp"] === "string" ? props["島_jp"].trim() : "-",
        genus: typeof props["Genus"] === "string" ? props["Genus"].trim() : "-",
        family: typeof props["Family"] === "string" ? props["Family"].trim() : "-",
        order: typeof props["Order"] === "string" ? props["Order"].trim() : "-",
        literatureID: typeof props["文献ID"] === "string" ? props["文献ID"].trim() : "-",
        page: typeof props["掲載ページ"] === "string" ? props["掲載ページ"].trim() : "-",
        original: typeof props["オリジナル"] === "string" ? props["オリジナル"].trim() : "-",
        originalJapaneseName: typeof props["文献中の和名"] === "string" ? props["文献中の和名"].trim() : "-",
        originalScientificName: typeof props["文献中で有効とされる学名_文献紹介など、その文献中で有効とされる学名がわからない場合はハイフンを記入してください。"] === "string" ? props["文献中で有効とされる学名_文献紹介など、その文献中で有効とされる学名がわからない場合はハイフンを記入してください。"].trim() : "-",
        location: typeof props["場所（原文ママ）"] === "string" ? props["場所（原文ママ）"].trim() : "-",
        note: typeof props["メモ"] === "string" ? props["メモ"].trim() : "-",
        registrant: typeof props["記入者"] === "string" ? props["記入者"].trim() : "-",
        registrationDate: typeof props["記入日付"] === "string" ? props["記入日付"].trim() : "-"
      };
    });

    updateFilters(rows, {}); // 初期フィルタを適用
  } catch (error) {
    console.error("GeoJSONの読み込みエラー:", error);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 地図を初期化
    initMap();

    // 各種データをロード
    await loadTaxonNameCSV(); // TaxonName.csvをロード
    loadOrderCSV("Prefecture.csv", prefectureOrder); // Prefecture.csvをロード
    loadOrderCSV("Island.csv", islandOrder); // Island.csvをロード
    await loadLiteratureCSV(); // Literature.csvをロード
    await loadGeoJSON(); // DistributionRecord_web.geojsonをロード

    // 初期データを使用して記録数と地点数を表示
    const initialRecordCount = rows.length;
    const initialLocationCount = new Set(rows.map(row => `${row.latitude},${row.longitude}`)).size;
    updateRecordInfo(initialRecordCount, initialLocationCount);

    // ドロップダウンのリスナーを設定
    setupDropdownListeners();

    // リセットボタンの動作を設定
    setupResetButton();

    // 実行ボタンのクリックイベントを設定
    document.getElementById("search-button").addEventListener("click", () => {
      applyFilters(); // 実行ボタンがクリックされたときにフィルタリングを実行
      applyFilters(); //セレクトボックスの選択をクリア後再実行
    });

    // 検索テキストを消去するボタンのイベントリスナー
    document.getElementById("clear-search-button").addEventListener("click", () => {
      // 検索窓の値をクリア
      clearSearch();

      // 現在のフィルタ状態で再度フィルタリングを適用
      applyFilters(null, true);
    });

    // チェックボックスのイベントリスナーを設定
    document.getElementById("exclude-unpublished").addEventListener("change", applyFilters); // 未公表データを除外
    document.getElementById("exclude-dubious").addEventListener("change", applyFilters); // 疑わしい記録を除外
    document.getElementById("exclude-citation").addEventListener("change", applyFilters); // 引用記録を除外
  } catch (error) {
    console.error("初期化中にエラーが発生:", error);
  }
});
