// translation.js
//
// translation.csv から翻訳を読み込み、data-i18n / data-i18n-tooltip を置き換える。
// CSV の1行目（ヘッダー）は次を想定：
// key,ar,de,en,es,fr,hi,hu,id,ja,ko,pt,ru,zh,zh_tw
//
// 注意：fetch() を使うため、file:// 直開きではなくローカルサーバーや GitHub Pages 等で配信してください。

// 対応言語コード（translation.csv の列名と一致させる）
const SUPPORTED_LANGS = ["ar","de","en","es","fr","hi","hu","id","ja","ko","pt","ru","zh","zh_tw"];

// translations[lang][key] = "..."
const translations = Object.fromEntries(SUPPORTED_LANGS.map(code => [code, {}]));

// ==================== CSV パーサ（ダブルクオート/カンマ対応、"" のエスケープ対応） ====================
function parseTranslationCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  // 改行は \n に統一
  const s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
          // "" → "
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }

  // 最終セル
  row.push(cell);
  rows.push(row);

  // 行末の空行を除去（全部空なら捨てる）
  while (rows.length > 0 && rows[rows.length - 1].every(v => String(v).trim() === "")) {
    rows.pop();
  }

  return rows;
}

// ==================== 翻訳CSVを読み込んで translations に格納 ====================
async function loadTranslationsCSV(url = "translation.csv") {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);

  // ★レスポンスヘッダの charset が怪しい場合でも、UTF-8 として確実に読む（必要なら shift_jis にフォールバック）
  const buf = await res.arrayBuffer();

  let csvText = new TextDecoder("utf-8").decode(buf);

  // UTF-8 で読めない（置換文字が出る）場合は Shift-JIS を試す
  if (csvText.includes("\uFFFD")) {
    try {
      csvText = new TextDecoder("shift_jis").decode(buf);
    } catch (e) {
      // shift_jis 非対応環境等でも落とさない
      console.warn("TextDecoder('shift_jis') failed. Keep utf-8 decoded text.", e);
    }
  }

  const table = parseTranslationCSV(csvText);
  if (!table || table.length === 0) return;

  // ヘッダ行
  const header = table[0].map(x => String(x || "").trim());

  // BOM対策：先頭セルが "\ufeffkey" になることがある
  if (header[0] && header[0].charCodeAt(0) === 0xFEFF) {
    header[0] = header[0].replace(/^\uFEFF/, "");
  }

  const keyIdx = header.indexOf("key");
  if (keyIdx === -1) throw new Error('translation.csv: header must include "key" column.');

  // 各言語列のインデックス
  const langToIndex = {};
  SUPPORTED_LANGS.forEach(code => {
    const idx = header.indexOf(code);
    if (idx !== -1) langToIndex[code] = idx;
  });

  // データ行
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const rawKey = line[keyIdx];
    const key = String(rawKey || "").trim();
    if (!key) continue;

    SUPPORTED_LANGS.forEach(code => {
      const idx = langToIndex[code];
      if (idx == null) return;
      const val = (line[idx] != null) ? String(line[idx]) : "";
      // 空文字は「未翻訳」とみなす
      if (val !== "") translations[code][key] = val;
    });
  }
}

// ==================== 翻訳の取得（fallback 付き） ====================
function getTranslation(lang, key) {
  if (!key) return "";
  return (
    translations?.[lang]?.[key]
    || translations?.["en"]?.[key]
    || translations?.["ja"]?.[key]
    || ""
  );
}

// ==================== data-i18n / data-i18n-tooltip の置換 ====================
function applyTranslations(lang) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : "ja";

  // 1) 言語を先に切り替える
  document.documentElement.setAttribute("lang", safeLang);
  localStorage.setItem("preferredLanguage", safeLang);
  window.lang = safeLang; // script.js 側の参照用

  // 2) data-i18n 対象を更新（未翻訳なら既存HTMLを保持）
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach(el => {
    const key = el.getAttribute("data-i18n");
    const htmlRaw = getTranslation(safeLang, key);
    const html = (key === "heading" && safeLang !== "en" && htmlRaw && !htmlRaw.includes("<br>Distribution of Japanese Millipede (under construction)"))
      ? (htmlRaw + "<br>Distribution of Japanese Millipede (under construction)")
      : htmlRaw;
    if (html !== "") el.innerHTML = html;
  });

  // 3) data-i18n-tooltip 対象も更新（未翻訳なら既存 data-tooltip を保持）
  const tooltipElements = document.querySelectorAll("[data-i18n-tooltip]");
  tooltipElements.forEach(el => {
    const tooltipKey = el.getAttribute("data-i18n-tooltip");
    const tooltipText = getTranslation(safeLang, tooltipKey);
    if (tooltipText !== "") el.setAttribute("data-tooltip", tooltipText);
  });

  // 4) フィルター状態を保ったまま、選択肢を更新（次の tick に遅延実行）
  setTimeout(() => {
    if (typeof applyFilters === "function") {
      applyFilters(true); // updateSelectBoxes → populateSelect が新しい言語で走る
    }
  }, 0);
}

// ==================== グローバル公開（script.js が利用） ====================
window.translations = translations;
window.getTranslation = getTranslation;
window.applyTranslations = applyTranslations;

// CSV 読み込みの Promise を公開（script.js 側で await 可能）
window.translationsReady = loadTranslationsCSV();
