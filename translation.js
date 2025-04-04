// translation.js

const translations = {
  ja: {
    // ===================== 既存キー =====================
    heading: "日本産ヤスデ類の分布 (作成中)",
    filter: "フィルター",
    reset: "リセット",
    publication_year: "出版年",
    collection_year: "採集年",
    periodicity: "周期性",
    collection_month: "採集月",
    include_year: "含める年",
    periodicity_years: "周期 (年)",
    january: "1月",
    february: "2月",
    march: "3月",
    april: "4月",
    may: "5月",
    june: "6月",
    july: "7月",
    august: "8月",
    september: "9月",
    october: "10月",
    november: "11月",
    december: "12月",
    lifestage: "ライフステージ",
    adult: "成体",
    juvenile_unknown: "幼体 / 不明",
    exclude_unpublished_data: "未公表データを除外",
    exclude_questionable_records: "疑わしい記録を除外",
    exclude_cited_records: "引用記録を除外",
    exclude_undescribed_species: "未記載種を除外",
    exclude_records_without_species_identification: "種同定されていない記録を除外",
    records: "レコード数",
    locations: "地点数",
    data: "データ",
    species: "種",
    prefecture: "都道府県",
    island: "島",
    reference: "引用文献",
    show_higher_taxa: "高次分類群を表示",

    // ===================== 追加: レジェンドのラベル用キー =====================
    legend_marker_types: "マーカーの種類",          // 上部見出し
    legend_type: "タイプ産地",
    legend_synonymized_type: "統合された種のタイプ産地",
    legend_doubtful_type: "疑わしいタイプ産地",
    legend_doubtful_synonymized_type: "統合された種の疑わしいタイプ産地",
    legend_specimen: "標本記録",
    legend_literature_record: "文献記録",
    legend_doubtful_literature: "疑わしい記録",

    // ===================== 追加: レジェンドのツールチップ用キー =====================
    legend_type_tooltip: "タイプ産地：種の基準となる標本が採集された場所です。",
    legend_synonymized_type_tooltip: "統合された種のタイプ産地：現在、有効とは見なされていないものの、過去には別種として扱われていた種のタイプ産地です。",
    legend_doubtful_type_tooltip: "疑わしいタイプ産地：タイプ産地とされたものの、実際には誤りの可能性が高いと考えられる産地です。",
    legend_doubtful_synonymized_type_tooltip: "統合された種の疑わしいタイプ産地：現在、有効とは見なされていないものの、過去には別の種として扱われていた種の疑わしいタイプ産地です。",
    legend_specimen_tooltip: "標本記録：本データベースの作成者が責任をもつ記録です。具体的には、データベースの作成者が標本を観察した記録と、共著論文の著者が標本を観察した記録が含まれます。",
    legend_literature_record_tooltip: "文献記録：標本記録を除く、文献に掲載された記録です。証拠が十分ではない記録も含まれており、一部の記録は将来、疑わしい記録に変わる可能性があります。",
    legend_doubtful_literature_tooltip: "疑わしい記録：明確な誤同定だけでなく、疑わしい記録も含みます。同一の同定者が別の出版物で同じ種を誤同定していたり、確かな記録から離れている場合、同定者の同定精度が著しく低い場合もこのカテゴリーに含まれます。",
    // セレクトボックス
    select_order: "目を選択",
    select_family: "科を選択",
    select_genus: "属を選択",
    select_species: "種を選択",
    select_prefecture: "都道府県を選択",
    select_island: "島を選択",
    select_literature: "文献を選択",
    number_of_records_by_month: "出現期（月別）",
    number_of_records: "記録数",
    month: "月",
    map_attribution: "「<a href='https://nlftp.mlit.go.jp/ksj/' target='_blank'>位置参照情報ダウンロードサービス</a>」（国土交通省）を加工して作成",
    // --- Prefecture Chart ---
    prefecture_chart_title_head: "各都道府県の", // 「各都道府県の」
    chart_by_order: "目別",
    chart_by_family: "科別",
    chart_ratio: "割合(%)",
    chart_records: "記録数",
    chart_species: "種数",
    chart_prefecture_axis: "都道府県",
    chart_ratio_axis: "割合(%)",
    chart_records_axis: "記録数",
    chart_species_axis: "種数",
    chart_tooltip_ratio: "{val}% ({absCount}種)",  // 後述のコールバック用
    // --- Year Chart ---
    year_chart_publication: "記録数と累積記録数（出版年）",
    year_chart_collection: "記録数と累積記録数（採集年）",
    year_chart_left_axis: "記録数",
    year_chart_right_axis: "累積記録数",
    // 凡例7種
    year_type_1: "原記載",
    year_type_2: "統合された種の原記載",
    year_type_3: "疑わしいタイプ",
    year_type_4: "疑わしい統合された種のタイプ",
    year_type_5: "標本記録",
    year_type_6: "文献記録",
    year_type_7: "疑わしい文献記録",
    order: "目",
    family: "科",
    number_of_species: "種数",
    number_of_records: "記録数",
    ratio: "割合",
    year_chart_cumulative_label: "累積記録数"

  },

  en: {
    // ===================== 既存キー =====================
    heading: "Distribution of Japanese Millipede (under construction)",
    filter: "Filter",
    reset: "Reset",
    publication_year: "Publication Year",
    collection_year: "Collection Year",
    periodicity: "Periodicity",
    collection_month: "Collection Month",
    include_year: "Include Year",
    periodicity_years: "Periodicity (Years)",
    january: "Jan.",
    february: "Feb.",
    march: "Mar.",
    april: "Apr.",
    may: "May",
    june: "Jun.",
    july: "Jul.",
    august: "Aug.",
    september: "Sep.",
    october: "Oct.",
    november: "Nov.",
    december: "Dec.",
    lifestage: "Life Stage",
    adult: "Adult",
    juvenile_unknown: "Juvenile / Unknown",
    exclude_unpublished_data: "Exclude unpublished data",
    exclude_questionable_records: "Exclude questionable records",
    exclude_cited_records: "Exclude cited records",
    exclude_undescribed_species: "Exclude undescribed species",
    exclude_records_without_species_identification: "Exclude records without species identification",
    records: "Records",
    locations: "Locations",
    data: "Data",
    species: "Species",
    prefecture: "Prefecture",
    island: "Island",
    reference: "Reference",
    show_higher_taxa: "Show Higher Taxa",

    // レジェンドのラベル用キー
    legend_marker_types: "Marker Types",
    legend_type: "Type locality",
    legend_synonymized_type: "Type locality of synonymized species",
    legend_doubtful_type: "Doubtful type locality",
    legend_doubtful_synonymized_type: "Doubtful type locality of synonymized species",
    legend_specimen: "Specimen record",
    legend_literature_record: "Literature record",
    legend_doubtful_literature: "Doubtful record",

    // レジェンドのツールチップ用キー
    legend_type_tooltip: "Type locality: The place where the specimen serving as the standard for a species (type specimen) was collected.",
    legend_synonymized_type_tooltip: "Type locality of synonymized species: A type locality of a species that is no longer considered valid, but was previously treated as a separate species.",
    legend_doubtful_type_tooltip: "Doubtful type locality: A locality described as a type locality, but which is now considered likely to be erroneous.",
    legend_doubtful_synonymized_type_tooltip: "Doubtful type locality of synonymized species: A previously separate species type locality now considered invalid or merged, with doubts.",
    legend_specimen_tooltip: "Specimen record: A record for which the creators of this database take responsibility. Specifically, this includes records based on specimens observed by the database creators or by coauthors of joint publications.",
    legend_literature_record_tooltip: "Literature record: A record published in the literature, excluding specimen records. These may include records lacking sufficient supporting evidence, and some may be reclassified as questionable in the future.",
    legend_doubtful_literature_tooltip: "Doubtful record: Not only clear misidentifications but also questionable records are included. This category also encompasses cases where the same identifier has misidentified the same species in other publications, where the record is far from any confirmed occurrences, or where the identifier's overall reliability is notably low.",
    // セレクトボックス
    select_order: "Select order",
    select_family: "Select family",
    select_genus: "Select genus",
    select_species: "Select species",
    select_prefecture: "Select prefecture",
    select_island: "Select island",
    select_literature: "Select literature",
    number_of_records_by_month: "Number of records by Month",
    number_of_records: "Number of records",
    month: "Month",
    map_attribution: "Created by processing data from <a href='https://nlftp.mlit.go.jp/ksj/' target='_blank'>Location Reference Information Download Service</a> (MLIT).",
    // --- Prefecture Chart ---
    prefecture_chart_title_head: "By Prefecture: ",
    chart_by_order: "by Order",
    chart_by_family: "by Family",
    chart_ratio: "Ratio(%)",
    chart_records: "Number of Records",
    chart_species: "Number of Species",
    chart_prefecture_axis: "Prefecture",
    chart_ratio_axis: "Ratio(%)",
    chart_records_axis: "Records",
    chart_species_axis: "Species",
    chart_tooltip_ratio: "{val}% ({absCount} sp.)",
    // --- Year Chart ---
    year_chart_publication: "Number of Records & Cumulative (Publication Year)",
    year_chart_collection: "Number of Records & Cumulative (Collection Year)",
    year_chart_left_axis: "Records",
    year_chart_right_axis: "Cumulative",
    // 7 types
    year_type_1: "Original description",
    year_type_2: "Original description of synonymized species",
    year_type_3: "Doubtful type",
    year_type_4: "Doubtful & Synonymized type",
    year_type_5: "Specimen record",
    year_type_6: "Literature record",
    year_type_7: "Doubtful literature record",
    order: "Order",
    family: "Faimily",
    number_of_species: "Number of species",
    number_of_records: "Number of records",
    ratio: "Ratio",
    year_chart_cumulative_label: "Cumulative number of records"
  }
};

/**
 * 指定した言語（"ja" や "en" など）で data-i18n 属性を持つ要素を置き換える。
 * さらに data-i18n-tooltip がある場合は data-tooltip も置き換える。
 */
function applyTranslations(lang) {
  document.documentElement.setAttribute("lang", lang);
  localStorage.setItem("preferredLanguage", lang);

  // data-i18n を持つ要素を全て取得してテキストを差し替え
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach(el => {
    const key = el.getAttribute("data-i18n");
    const text = translations[lang] && translations[lang][key]
      ? translations[lang][key]
      : (translations["ja"][key] || "");
    el.textContent = text;

    // 追加: data-i18n-tooltip をチェック
    const tooltipKey = el.getAttribute("data-i18n-tooltip");
    if (tooltipKey) {
      const tooltipText = translations[lang] && translations[lang][tooltipKey]
        ? translations[lang][tooltipKey]
        : (translations["ja"][tooltipKey] || "");
      // 実際の data-tooltip 属性を置き換える
      el.setAttribute("data-tooltip", tooltipText);
    }
  });
}
