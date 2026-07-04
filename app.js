let data = window.FEEDBACK_DATA;
const demoData = JSON.parse(JSON.stringify(window.FEEDBACK_DATA));
let importedRows = [];
let analyzedRows = [];
let uploadedFileBaseName = "";
const PUBLIC_DEMO_MODE = true;

const BATCH_INTERVAL_MS = 3500;
const RETRY_DELAYS = [8000, 16000, 32000, 60000];

const state = {
  product: "全部",
  sentiment: "全部",
  severity: "全部",
  purchase: "全部",
  search: "",
};

const productClass = {
  产品A: "product-a",
  竞品B: "comp-b",
  竞品C: "comp-c",
};

function $(id) {
  return document.getElementById(id);
}

function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || "-";
  return n.toLocaleString("zh-CN");
}

function unique(list, key) {
  return ["全部", ...Array.from(new Set(list.map((item) => item[key]).filter(Boolean)))];
}

function productOptions() {
  const preferred = ["产品A", "竞品B", "竞品C"];
  const existing = new Set((data.evidence || []).map((item) => item["产品代号"]).filter(Boolean));
  const others = Array.from(existing).filter((item) => !preferred.includes(item));
  return ["全部", ...preferred.filter((item) => existing.has(item)), ...others];
}

function optionList(el, values) {
  el.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function productTag(code) {
  return `<span class="tag ${productClass[code] || ""}">${code}</span>`;
}

function sentimentTag(value) {
  return `<span class="sentiment-pill sentiment-${value}">${value}</span>`;
}

function includesSearch(item) {
  if (!state.search) return true;
  const haystack = [
    item["评论编号"],
    item["产品代号"],
    item["产品名称"],
    item["平台"],
    item["一级问题"],
    item["二级标签"],
    item["用户态度"],
    item["严重程度"],
    item["具体反馈点"],
    item["原文证据"],
    item["可优化方向"],
    item["可转化表达方向"],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function filterByGlobal(item) {
  if (state.product !== "全部" && item["产品代号"] !== state.product) return false;
  if (state.sentiment !== "全部" && item["用户态度"] !== state.sentiment) return false;
  if (state.severity !== "全部" && item["严重程度"] !== state.severity) return false;
  if (state.purchase !== "全部" && item["购买影响"] !== state.purchase) return false;
  return includesSearch(item);
}

function renderMetrics() {
  const valid = data.overview["有效反馈数"] || 0;
  const total = data.overview["总评论数"] || 0;
  const negative = data.products.reduce((sum, p) => sum + Number(p["负向数"] || 0), 0);
  const purchase = data.products.reduce((sum, p) => sum + Number(p["涉及购买/复购数"] || 0), 0);

  const cards = [
    ["总评论数", total, `来自 ${data.overview["产品数量"] || data.products.length || 0} 款产品评价`],
    ["有效反馈数", valid, `有效反馈率 ${total ? fmtPct(valid / total) : "-"}`],
    ["负向反馈数", negative, "用于问题优化池判断"],
    ["购买影响反馈", purchase, "影响购买或复购判断"],
  ];

  $("metricGrid").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${fmtNum(value)}</div>
          <div class="metric-note">${note}</div>
        </article>
      `,
    )
    .join("");
}

function renderProductCards() {
  $("productCards").innerHTML = data.products
    .map(
      (p) => `
        <article class="product-card">
          <div class="product-head">
            <div>
              <div class="product-name">${p["产品名称"]}</div>
              <div class="metric-note">${p["Top一级问题"] || ""}</div>
            </div>
            ${productTag(p["产品代号"])}
          </div>
          <div class="mini-metrics">
            <div class="mini-metric">负向占比<b>${fmtPct(p["负向占比"])}</b></div>
            <div class="mini-metric">高严重<b>${fmtPct(p["高严重占比"])}</b></div>
            <div class="mini-metric">购买影响<b>${fmtPct(p["购买影响占比"])}</b></div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderComparison() {
  const metrics = [
    ["负向占比", "负向占比", "red"],
    ["高严重占比", "高严重占比", "orange"],
    ["购买影响占比", "购买影响占比", "green"],
  ];
  $("comparisonBars").innerHTML = data.products
    .map((p) => {
      const bars = metrics
        .map(([label, key, color]) => {
          const pct = Number(p[key] || 0);
          return `
            <div class="bar-row">
              <div class="bar-label"><span>${label}</span><span>${fmtPct(pct)}</span></div>
              <div class="bar-track"><div class="bar-fill ${color}" style="width:${Math.max(2, pct * 100)}%"></div></div>
            </div>
          `;
        })
        .join("");
      return `
        <article class="product-card">
          <div class="product-head">
            <div class="product-name">${p["产品名称"]}</div>
            ${productTag(p["产品代号"])}
          </div>
          ${bars}
        </article>
      `;
    })
    .join("");

  renderTable("comparisonTable", data.products, [
    "产品代号",
    "产品名称",
    "评论数",
    "有效反馈数",
    "负向占比",
    "高严重占比",
    "购买影响占比",
    "Top一级问题",
    "Top二级标签",
  ]);
}

function topDistribution(productLabel, dimension, limit = 6) {
  return data.issueDistribution
    .filter((item) => item["产品"] === productLabel && item["维度"] === dimension)
    .sort((a, b) => Number(b["数量"]) - Number(a["数量"]))
    .slice(0, limit);
}

function renderDistribution() {
  $("distributionGrid").innerHTML = data.products
    .map((p) => {
      const productLabel = `${p["产品代号"] === "产品A" ? "产品A" : p["产品代号"]}｜${p["产品名称"]}`;
      const primary = topDistribution(productLabel, "一级问题", 5);
      const max = Math.max(...primary.map((item) => Number(item["数量"] || 0)), 1);
      const rows = primary
        .map((item) => {
          const width = (Number(item["数量"]) / max) * 100;
          return `
            <div class="dist-item">
              <div class="dist-label"><span>${item["标签"]}</span><b>${item["数量"]}条 · ${fmtPct(item["占比"])}</b></div>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            </div>
          `;
        })
        .join("");
      return `
        <article class="distribution-card">
          <div class="product-head">
            <h3>${p["产品名称"]}</h3>
            ${productTag(p["产品代号"])}
          </div>
          <div class="distribution-list">${rows || '<div class="empty-state">暂无数据</div>'}</div>
        </article>
      `;
    })
    .join("");
}

function renderInsightCards(targetId, list, type) {
  const isIssue = type === "issue";
  const filtered = mergeInsightItems(
    list.filter((item) => {
      if (state.product !== "全部" && item["产品代号"] !== state.product) return false;
      return includesSearch(item);
    }),
    type,
  ).sort((a, b) => Number(b[isIssue ? "优化优先级分" : "卖点价值分"]) - Number(a[isIssue ? "优化优先级分" : "卖点价值分"]));

  if (!filtered.length) {
    $(targetId).innerHTML = '<div class="empty-state">当前筛选条件下没有匹配结果。</div>';
    return;
  }

  $(targetId).innerHTML = filtered
    .slice(0, 18)
    .map((item) => {
      const scoreKey = isIssue ? "优化优先级分" : "卖点价值分";
      const actionKey = isIssue ? "可优化方向" : "可转化表达方向";
      const countKey = isIssue ? "问题数" : "反馈数";
      const originalLabels = (item["原始二级标签"] || []).map(escapeHtml).join("、");
      return `
        <article class="insight-card">
          <div class="card-head">
            <div>
              <div class="card-title">${escapeHtml(item["二级标签"])}</div>
              <div class="metric-note">${escapeHtml(item["产品名称"])}</div>
              <div class="original-labels">原始标签：${originalLabels || escapeHtml(item["二级标签"])}</div>
            </div>
            <div class="score"><span>${isIssue ? "优先级" : "卖点分"}</span><b>${item[scoreKey]}</b></div>
          </div>
          <div class="card-tags">
            ${productTag(item["产品代号"])}
            <span class="tag">${escapeHtml(item["一级问题"])}</span>
            <span class="tag">${isIssue ? `问题数 ${item[countKey]}` : `反馈数 ${item[countKey]}`}</span>
            <span class="tag">购买影响 ${item["购买影响数"]}</span>
          </div>
          <div class="evidence-block"><span class="block-title">代表证据</span>${escapeHtml(item["代表证据"] || "暂无")}</div>
          <div class="action-block"><span class="block-title">${isIssue ? "可优化方向" : "可转化表达方向"}</span>${escapeHtml(item[actionKey] || "暂无")}</div>
        </article>
      `;
    })
    .join("");
}

function mergeInsightItems(list, type) {
  const isIssue = type === "issue";
  const scoreKey = isIssue ? "优化优先级分" : "卖点价值分";
  const countKey = isIssue ? "问题数" : "反馈数";
  const actionKey = isIssue ? "可优化方向" : "可转化表达方向";
  const groups = groupRows(list, (item) => {
    const theme = inferInsightTheme(item, type);
    return [item["产品代号"], item["产品名称"], item["一级问题"], theme].join("||");
  });

  return Object.values(groups).map((items) => {
    const base = items[0];
    const labels = Array.from(new Set(items.map((item) => item["二级标签"]).filter(Boolean)));
    const theme = inferInsightTheme(base, type);
    return {
      产品代号: base["产品代号"],
      产品名称: base["产品名称"],
      一级问题: base["一级问题"],
      二级标签: theme,
      原始二级标签: labels,
      [countKey]: sumField(items, countKey),
      产品内占比: sumField(items, "产品内占比"),
      负向数: sumField(items, "负向数"),
      高严重数: sumField(items, "高严重数"),
      购买影响数: sumField(items, "购买影响数"),
      [scoreKey]: sumField(items, scoreKey),
      代表证据: collectUniqueText(items, "代表证据", 3).join("；"),
      [actionKey]: collectUniqueText(items, actionKey, 2).join("；"),
    };
  });
}

function sumField(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function collectUniqueText(items, key, limit) {
  const values = [];
  items.forEach((item) => {
    String(item[key] || "")
      .split(/[；;]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        if (!values.includes(value)) values.push(value);
      });
  });
  return values.slice(0, limit);
}

const ISSUE_THEME_RULES = [
  { theme: "账号与隐私安全", keywords: ["账号", "盗", "隐私", "数据", "泄露", "身份"] },
  { theme: "安全与规则误判", keywords: ["安全", "误判", "敏感", "拦截", "伦理", "风险"] },
  { theme: "任务理解与输出质量", keywords: ["指令", "理解", "上下文", "生成", "输出", "ppt", "文档", "幻灯"] },
  { theme: "性能与稳定性", keywords: ["卡顿", "闪退", "崩溃", "加载", "响应慢", "输入框", "电脑端", "稳定"] },
  { theme: "功能限制与交互", keywords: ["限制", "免费", "会员", "功能", "缺少", "缺乏", "悬浮球", "多模态", "上传"] },
  { theme: "效果感知落差", keywords: ["减重", "效果", "食欲", "肠胃", "便秘", "腹泻", "因人而异", "不明显"] },
  { theme: "功效信任顾虑", keywords: ["智商税", "质疑", "存疑", "信任", "夸大", "功效"] },
  { theme: "价格权益阻碍", keywords: ["价格", "贵", "活动", "权益", "付费", "套餐"] },
  { theme: "使用体验问题", keywords: ["口感", "异味", "服用", "胀气", "排气", "操作", "体验"] },
  { theme: "包装与便利性", keywords: ["包装", "携带", "瓶身", "开盖"] },
  { theme: "服务履约问题", keywords: ["客服", "售后", "物流", "赠品", "营养师", "发货"] },
  { theme: "信息说明不足", keywords: ["适用人群", "成分", "说明", "认知", "教程", "引导"] },
];

const SELLING_THEME_RULES = [
  { theme: "AI能力卖点", keywords: ["多模型", "模型", "中文", "多模态", "生态", "助手", "chat", "聊天"] },
  { theme: "效率与输出认可", keywords: ["创作", "生成", "总结", "错题", "效率", "理解", "输出", "场景"] },
  { theme: "效果价值认可", keywords: ["减重", "效果", "食欲", "肠胃", "改善", "明显", "因人而异", "饮食", "运动"] },
  { theme: "使用体验认可", keywords: ["口感", "包装", "携带", "服用", "便利", "好用", "体验"] },
  { theme: "购买转化认可", keywords: ["活动", "划算", "复购", "推荐", "达人", "朋友", "信任", "品牌"] },
  { theme: "服务体验认可", keywords: ["客服", "营养师", "物流", "赠品", "售后"] },
  { theme: "产品认知兴趣", keywords: ["成分", "适用", "认知", "兴趣"] },
];

function inferInsightTheme(item, type) {
  const text = [item["二级标签"], item["一级问题"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rules = type === "issue" ? ISSUE_THEME_RULES : SELLING_THEME_RULES;
  const matched = rules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())));
  if (matched) return matched.theme;

  const primary = item["一级问题"] || "其他";
  if (type === "issue") return `${primary}待优化主题`;
  return `${primary}正向卖点`;
}

function renderOperationReport() {
  const target = $("operationReport");
  if (!target) return;
  const total = Number(data.overview?.["总评论数"] || data.evidence?.length || 0);
  const valid = Number(data.overview?.["有效反馈数"] || data.evidence?.length || 0);
  const products = data.products || [];
  const topRiskProduct = [...products].sort((a, b) => productRiskScore(b) - productRiskScore(a))[0];
  const topIssues = mergeInsightItems(data.issuePool || [], "issue")
    .filter((item) => {
      return Boolean(item["二级标签"]);
    })
    .sort((a, b) => Number(b["优化优先级分"]) - Number(a["优化优先级分"]))
    .slice(0, 3);
  const topSellings = mergeInsightItems(data.sellingPool || [], "selling")
    .sort((a, b) => Number(b["卖点价值分"]) - Number(a["卖点价值分"]))
    .slice(0, 3);
  const negative = products.reduce((sum, item) => sum + Number(item["负向数"] || 0), 0);
  const purchase = products.reduce((sum, item) => sum + Number(item["涉及购买/复购数"] || 0), 0);
  const issueText = topIssues.length
    ? topIssues.map((item) => `${item["产品名称"]}的${item["二级标签"]}（${item["问题数"]}条）`).join("、")
    : "当前样本暂未形成稳定的高优先级问题";
  const sellingText = topSellings.length
    ? topSellings.map((item) => `${item["产品名称"]}的${item["二级标签"]}（${item["反馈数"]}条）`).join("、")
    : "当前样本暂未形成稳定的正向卖点";
  const riskText = topRiskProduct
    ? `${topRiskProduct["产品名称"]}风险相对更高，负向占比${fmtPct(topRiskProduct["负向占比"])}、高严重占比${fmtPct(topRiskProduct["高严重占比"])}、购买影响占比${fmtPct(topRiskProduct["购买影响占比"])}`
    : "当前样本暂不足以判断单一高风险产品";
  const paragraph = `本次分析覆盖${fmtNum(products.length)}款产品、${fmtNum(total)}条评论，其中有效反馈${fmtNum(valid)}条，整体包含${fmtNum(negative)}条负向反馈和${fmtNum(purchase)}条购买影响反馈。从产品风险看，${riskText}；从问题结构看，核心矛盾主要集中在${issueText}，这些问题会直接影响用户对功能稳定性、结果可信度和持续使用价值的判断。与此同时，正向反馈显示${sellingText}具备进一步转化为详情页卖点、用户案例或投放素材的潜力。下一步产品运营应优先处理高频、高严重且影响购买的问题，围绕功能体验、信息说明、FAQ、用户引导和客服话术制定优化动作，同时把已被真实评论验证的卖点沉淀为对外表达素材，形成“风险收敛 + 卖点放大”的迭代闭环。`;

  target.innerHTML = `<p>${escapeHtml(paragraph)}</p>`;
}

function productRiskScore(product) {
  return Number(product["负向占比"] || 0) * 4 + Number(product["高严重占比"] || 0) * 3 + Number(product["购买影响占比"] || 0) * 3;
}

function displayValue(key, value) {
  if (["负向占比", "高严重占比", "购买影响占比", "有效反馈占比", "产品内占比", "占比"].includes(key)) {
    return fmtPct(value);
  }
  if (key === "产品代号") return productTag(value);
  if (key === "用户态度") return sentimentTag(value);
  return value ?? "";
}

function fieldClass(key) {
  const classes = {
    平台: "col-platform",
    评论原文: "col-comment",
    原文证据: "col-evidence",
    具体反馈点: "col-feedback",
    可优化方向: "col-action",
    可转化表达方向: "col-action",
    产品名称: "col-product-name",
  };
  return classes[key] || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(targetId, rows, columns) {
  const head = `<thead><tr>${columns.map((col) => `<th class="${fieldClass(col)}">${col}</th>`).join("")}</tr></thead>`;
  const body = rows
    .map((row) => `<tr>${columns.map((col) => `<td class="${fieldClass(col)}">${displayValue(col, row[col])}</td>`).join("")}</tr>`)
    .join("");
  $(targetId).innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderEvidence() {
  const rows = data.evidence.filter(filterByGlobal);
  $("evidenceCount").textContent = `当前显示 ${rows.length} 条证据，支持按产品、态度、严重程度、购买影响和关键词筛选。`;
  renderTable(
    "evidenceTable",
    rows.slice(0, 160),
    ["评论编号", "产品代号", "平台", "一级问题", "二级标签", "用户态度", "严重程度", "购买影响", "具体反馈点", "原文证据", "可优化方向"],
  );
}

function renderFieldGuide() {
  $("fieldGuide").innerHTML = withScoreFieldGuide(data.fieldGuide)
    .map(
      (item) => `
        <article class="field-card">
          <h3>${item["字段"]}</h3>
          <p>${item["说明"]}</p>
        </article>
      `,
    )
    .join("");
}

function withScoreFieldGuide(items = []) {
  const filtered = items.filter((item) => {
    const field = String(item["字段"] || "");
    return !field.includes("优化优先级分") && !field.includes("卖点价值分");
  });
  return [
    ...filtered,
    {
      字段: "优化优先级分",
      说明:
        "公式：问题数 × 2 + 高严重数 × 3 + 购买影响数 × 4 + 负向数 × 2 + 复杂数 × 1。设计逻辑：同时衡量问题出现频率、严重程度、是否影响购买或复购，以及负向/复杂态度带来的产品风险。",
    },
    {
      字段: "卖点价值分",
      说明:
        "公式：反馈数 × 5 + 购买影响数 × 4 + 一级问题权重。一级问题权重：效果感知=3，使用体验=2，产品认知=1，其他=0。设计逻辑：优先保留被多次正向提及、能影响购买、且更接近产品核心价值的卖点。",
    },
  ];
}

function renderAll() {
  renderMetrics();
  renderProductCards();
  renderComparison();
  renderDistribution();
  renderInsightCards("issueCards", data.issuePool, "issue");
  renderInsightCards("sellingCards", data.sellingPool, "selling");
  renderEvidence();
  renderOperationReport();
  renderFieldGuide();
}

function resetFilterState() {
  state.product = "全部";
  state.sentiment = "全部";
  state.severity = "全部";
  state.purchase = "全部";
  state.search = "";
}

function refreshFilterOptions() {
  optionList($("filterProduct"), productOptions());
  optionList($("filterSentiment"), unique(data.evidence || [], "用户态度"));
  optionList($("filterSeverity"), unique(data.evidence || [], "严重程度"));
  optionList($("filterPurchase"), unique(data.evidence || [], "购买影响"));
  $("filterProduct").value = state.product;
  $("filterSentiment").value = state.sentiment;
  $("filterSeverity").value = state.severity;
  $("filterPurchase").value = state.purchase;
  $("searchInput").value = state.search;
}

function parseDelimited(text) {
  const clean = text.trim();
  if (!clean) return [];
  const delimiter = clean.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  const headers = rows.shift().map((item) => item.trim());
  return rows
    .filter((items) => items.some((item) => String(item || "").trim()))
    .map((items) =>
      headers.reduce((acc, header, index) => {
        acc[header || `字段${index + 1}`] = (items[index] || "").trim();
        return acc;
      }, {}),
    );
}

function setStatus(message, type = "") {
  const el = $("analyzerStatus");
  if (!el) return;
  el.className = `analyzer-status ${type}`.trim();
  el.textContent = message;
}

function setPublicDemoMode() {
  const demoHeaders = ["评论原文", "产品代号", "产品名称", "平台"];
  fillSelect("mapComment", demoHeaders, "评论原文");
  fillSelect("mapProductCode", demoHeaders, "产品代号");
  fillSelect("mapProductName", demoHeaders, "产品名称");
  fillSelect("mapPlatform", demoHeaders, "平台");

  const lockedIds = [
    "uploadFile",
    "singleCommentInput",
    "runSingleComment",
    "mapComment",
    "mapProductCode",
    "mapProductName",
    "mapPlatform",
    "geminiKey",
    "geminiModel",
    "batchSize",
    "runSample",
    "runAll",
    "useDemoData",
    "downloadAnalysis",
  ];
  lockedIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled = true;
    el.setAttribute("aria-disabled", "true");
    el.classList.add("public-demo-locked");
  });
  $("geminiKey").value = "";
  $("geminiKey").placeholder = "公开演示版不开放 API Key";
  $("singleCommentInput").placeholder = "公开演示版仅展示入口，不开放临时分析。";
  $("downloadAnalysis").disabled = true;
  setStatus("公开演示版当前展示益生菌 264 条样本数据；AI 分析台仅作流程展示，上传、API 分析和下载功能已锁定。", "demo");
}

function normalizeHeader(header) {
  return String(header || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function guessHeader(headers, rules, fallback = "") {
  const normalized = headers.map((header) => ({ raw: header, value: normalizeHeader(header) }));
  const exact = (rules.exact || []).map(normalizeHeader);
  const exactMatch = normalized.find((item) => exact.includes(item.value));
  if (exactMatch) return exactMatch.raw;

  const includes = (rules.includes || []).map(normalizeHeader);
  const excludes = (rules.excludes || []).map(normalizeHeader);
  const looseMatch = normalized.find((item) => {
    const hit = includes.some((keyword) => item.value.includes(keyword));
    const blocked = excludes.some((keyword) => item.value.includes(keyword));
    return hit && !blocked;
  });
  return looseMatch ? looseMatch.raw : fallback;
}

function fillSelect(id, headers, selected) {
  const values = ["无", ...headers];
  $(id).innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  $(id).value = selected || "无";
}

function populateMapping(rows) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
  fillSelect(
    "mapComment",
    headers,
    guessHeader(
      headers,
      {
        exact: ["评论原文", "评论内容", "用户评论", "评价原文", "评价内容", "反馈原文", "反馈内容", "review", "comment", "content"],
        includes: ["评论原文", "评论内容", "用户评论", "评价原文", "评价内容", "反馈原文", "反馈内容", "评论", "评价", "反馈", "review", "comment", "content"],
        excludes: ["编号", "序号", "id", "产品", "商品", "代号", "名称", "平台", "渠道"],
      },
      "无",
    ),
  );
  fillSelect(
    "mapProductCode",
    headers,
    guessHeader(
      headers,
      {
        exact: ["产品代号", "产品编号", "产品编码", "商品代号", "商品编号", "sku", "productcode"],
        includes: ["产品代号", "产品编号", "产品编码", "商品代号", "商品编号", "sku", "code", "代号", "编号"],
        excludes: ["评论", "评价", "反馈", "名称", "name", "平台"],
      },
      "无",
    ),
  );
  fillSelect(
    "mapProductName",
    headers,
    guessHeader(
      headers,
      {
        exact: ["产品名称", "商品名称", "品名", "productname"],
        includes: ["产品名称", "商品名称", "品名", "productname", "name", "名称"],
        excludes: ["评论", "评价", "反馈", "代号", "编号", "code", "平台"],
      },
      "无",
    ),
  );
  fillSelect(
    "mapPlatform",
    headers,
    guessHeader(
      headers,
      {
        exact: ["平台", "渠道", "来源平台", "销售平台", "platform", "channel"],
        includes: ["平台", "渠道", "来源", "platform", "channel"],
        excludes: ["评论", "评价", "反馈", "产品", "商品"],
      },
      "无",
    ),
  );
}

function renderImportPreview() {
  if (!importedRows.length) {
    $("importPreview").innerHTML = "";
    $("previewNote").textContent = "";
    return;
  }
  const previewRows = importedRows.slice(0, 5);
  const columns = Array.from(new Set(previewRows.flatMap((row) => Object.keys(row || {}))));
  $("previewNote").textContent = "数据预览仅展示前 5 条";
  renderTable("importPreview", previewRows, columns);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文件读取失败，请重试。"));
    if (["xlsx", "xls"].includes(ext)) {
      if (!window.XLSX) {
        reject(new Error("表格解析库没有加载成功。请联网刷新页面，或另存为 CSV/TSV 后再上传。"));
        return;
      }
      reader.onload = (event) => {
        const workbook = window.XLSX.read(event.target.result, { type: "array" });
        const rows = workbook.SheetNames.flatMap((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return window.XLSX.utils.sheet_to_json(sheet, { defval: "" }).filter((row) =>
            Object.values(row).some((value) => String(value || "").trim()),
          );
        });
        resolve(rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => resolve(parseDelimited(event.target.result));
      reader.readAsText(file);
    }
  });
}

function selectedField(id) {
  const value = $(id).value;
  return value && value !== "无" ? value : "";
}

function getMappedRows(limit) {
  const commentKey = selectedField("mapComment");
  const codeKey = selectedField("mapProductCode");
  const nameKey = selectedField("mapProductName");
  const platformKey = selectedField("mapPlatform");
  if (!commentKey || !codeKey || !nameKey || !platformKey) {
    throw new Error("批量分析需要选择评论原文、产品代号、产品名称和平台列。单条评论请使用左侧临时分析。");
  }

  return importedRows
    .slice(0, limit || importedRows.length)
    .map((row, index) => {
      const code = String(codeKey ? row[codeKey] : "").trim();
      const name = String(nameKey ? row[nameKey] : "").trim();
      return {
        评论编号: row["评论编号"] || row["编号"] || row.id || index + 1,
        产品代号: code || (name ? "产品A" : "产品A"),
        产品名称: name || code || "未命名产品",
        平台: String(platformKey ? row[platformKey] : "").trim() || "未知平台",
        评论原文: String(row[commentKey] || "").trim(),
      };
    })
    .filter((row) => row["评论原文"]);
}

function makePrompt(rows) {
  return `你是AI产品运营和用户反馈分析助手。请把用户评论转成结构化产品反馈数据，用于产品优化、竞品分析和卖点提炼。

请只输出JSON数组，不要输出解释文字，不要使用Markdown代码块。

每条评论输出一个对象，字段必须完全一致：
评论编号、产品代号、产品名称、平台、一级问题、二级标签、用户态度、严重程度、购买影响、有效反馈、具体反馈点、原文证据、可优化方向。

字段规则：
1. 一级问题：从「效果感知、使用体验、购买决策、服务履约、产品认知、信任安全、无效评价」中选择最贴切的一类。涉及数据隐私、账号安全、内容安全误判、AI伦理、模型安全、人身或社会风险担忧时，归为「信任安全」。
2. 二级标签：只能输出一个主标签，10个字以内；不得使用顿号、逗号、斜杠连接多个标签；不得堆关键词。只保留最影响购买、复购或满意度的主问题/主卖点，例如「限购影响复购」「客服响应快」「产品异味」「保湿效果好」。
3. 用户态度：只能填「正向」「负向」「复杂」。正负都有时填「复杂」。只有评论主要在表扬产品已有能力或已有体验时，才填「正向」；如果评论是“认可产品，但希望增加、优化、修复某功能”，填「复杂」，不要当作纯正向卖点。
4. 严重程度：只能填「高」「中」「低」。影响购买、信任、效果判断或售后纠纷的填高；一般体验问题填中；轻微表达填低。
5. 购买影响：如果评论影响购买、复购、退货、信任或推荐，填「是」，否则填「否」。
6. 有效反馈：只要评论涉及产品效果、使用体验、肤感、气味、成分、包装、价格、活动、客服、物流、复购、推荐、信任等具体信息，都填「是」；只有一级问题判断为「无效评价」时，才填「否」。
7. 具体反馈点：控制在25字内，用产品运营语言提炼，不复述原文；要表达「用户真正反馈了什么」和「为什么影响产品判断」，不要写成评论改写。
8. 原文证据：不要全文摘抄，只截取最关键原话；优先选择能支撑二级标签和具体反馈点的短句。
9. 可优化方向：必须具体、产品化、可执行。要写清楚应该改哪个触点或材料，例如详情页、FAQ、客服话术、售后流程、活动规则、赠品策略、包装说明、内容素材；同时写清楚怎么改、解决什么用户顾虑。不要写「优化体验」「加强宣传」「提升服务」这类泛话。正向反馈写可如何转成卖点、详情页模块、口播脚本或投放素材；负向/复杂反馈写可如何降低误解、投诉、流失或购买阻碍。只有真正正向卖点才写成卖点表达；功能建议、缺陷修复、风险担忧不要包装成卖点。
10. 如果一条评论包含多个信息点，只选择最影响购买、复购或满意度的主问题/主卖点；不要为了覆盖完整而平均罗列所有信息。

限制：
不要替品牌做夸大宣传。
不要生成医学、治疗或减重功效承诺。
不要把评论中没有的信息补充进去。

待分析评论：
${JSON.stringify(rows, null, 2)}`;
}

function parseModelJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(apiKey, model, rows) {
  if (PUBLIC_DEMO_MODE) {
    throw new Error("公开演示版不开放 Gemini API 调用。");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: makePrompt(rows) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Gemini 调用失败：${response.status} ${detail.slice(0, 180)}`);
    error.status = response.status;
    throw error;
  }
  const result = await response.json();
  const text = (result.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  if (!text) throw new Error("Gemini 没有返回可解析内容。");
  return parseModelJson(text);
}

async function callGeminiWithRetry(apiKey, model, rows, label) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      return await callGemini(apiKey, model, rows);
    } catch (error) {
      const canRetry = [429, 500, 502, 503, 504].includes(error.status) && attempt < RETRY_DELAYS.length;
      if (!canRetry) throw error;
      const waitSeconds = Math.round(RETRY_DELAYS[attempt] / 1000);
      const note = error.status === 429 ? "可能是额度或速率限制" : "可能是模型繁忙";
      setStatus(`${label} 遇到 ${error.status}（${note}），${waitSeconds} 秒后自动重试第 ${attempt + 1} 次...`, "running");
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw new Error("Gemini 调用失败，请稍后重试。");
}

const TRUST_SAFETY_KEYWORDS = [
  "隐私",
  "数据隐私",
  "数据安全",
  "数据收集",
  "数据滥用",
  "伦理",
  "安全",
  "账号",
  "盗",
  "泄露",
  "滥用",
  "人身",
  "风险",
  "不安全",
  "误判",
  "敏感",
  "拦截",
  "限制误判",
  "身份",
];

function normalizePrimaryIssue(primaryIssue, row = {}, fallback = {}) {
  const issue = String(primaryIssue || "").trim();
  const haystack = [
    issue,
    row["二级标签"],
    row["具体反馈点"],
    row["原文证据"],
    row["可优化方向"],
    fallback["评论原文"],
  ]
    .filter(Boolean)
    .join(" ");

  if (TRUST_SAFETY_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "信任安全";
  }

  const allowed = ["效果感知", "使用体验", "购买决策", "服务履约", "产品认知", "信任安全", "无效评价"];
  return allowed.includes(issue) ? issue : "无效评价";
}

function normalizeResult(row, fallback = {}) {
  const get = (key, value = "") => String(row[key] ?? fallback[key] ?? value).trim();
  const primaryIssue = normalizePrimaryIssue(get("一级问题", "无效评价"), row, fallback);
  return {
    评论编号: get("评论编号"),
    产品代号: get("产品代号", "产品A"),
    产品名称: get("产品名称", get("产品代号", "未命名产品")),
    平台: get("平台", "未知平台"),
    一级问题: primaryIssue,
    二级标签: get("二级标签", "未分类"),
    用户态度: ["正向", "负向", "复杂"].includes(get("用户态度")) ? get("用户态度") : "复杂",
    严重程度: ["高", "中", "低"].includes(get("严重程度")) ? get("严重程度") : "中",
    购买影响: get("购买影响") === "是" ? "是" : "否",
    有效反馈: primaryIssue === "无效评价" ? "否" : "是",
    具体反馈点: get("具体反馈点"),
    原文证据: get("原文证据", fallback["评论原文"] || ""),
    可优化方向: get("可优化方向"),
  };
}

function clearSingleComment(clearInput = false) {
  const input = $("singleCommentInput");
  const result = $("singleCommentResult");
  if (clearInput && input) input.value = "";
  if (result) result.innerHTML = "";
}

function renderSingleCommentResult(row) {
  $("singleCommentResult").innerHTML = `
    <article class="single-result-card">
      <div class="single-result-head">
        <span class="tag">${escapeHtml(row["一级问题"])}</span>
        <span class="tag">${escapeHtml(row["二级标签"])}</span>
        ${sentimentTag(row["用户态度"])}
        <span class="tag">严重程度 ${escapeHtml(row["严重程度"])}</span>
        <span class="tag">购买影响 ${escapeHtml(row["购买影响"])}</span>
      </div>
      <div class="single-result-grid">
        <div>
          <span class="block-title">具体反馈点</span>
          <p>${escapeHtml(row["具体反馈点"] || "暂无")}</p>
        </div>
        <div>
          <span class="block-title">原文证据</span>
          <p>${escapeHtml(row["原文证据"] || "暂无")}</p>
        </div>
        <div class="single-result-action">
          <span class="block-title">可优化方向</span>
          <p>${escapeHtml(row["可优化方向"] || "暂无")}</p>
        </div>
      </div>
    </article>
  `;
}

async function runSingleCommentAnalysis() {
  if (PUBLIC_DEMO_MODE) {
    setStatus("公开演示版不开放单条评论分析，请在私有本地版中操作。", "demo");
    return;
  }
  const apiKey = $("geminiKey").value.trim();
  const model = $("geminiModel").value.trim();
  const comment = $("singleCommentInput").value.trim();
  if (!apiKey) {
    setStatus("请先填写 Gemini API Key。", "error");
    return;
  }
  if (!model) {
    setStatus("请先填写模型名称。", "error");
    return;
  }
  if (!comment) {
    setStatus("请先粘贴一条评论原文。", "error");
    return;
  }

  try {
    setAnalyzerBusy(true);
    $("singleCommentResult").innerHTML = "";
    const fallback = {
      评论编号: "单条",
      产品代号: "临时",
      产品名称: "单条评论",
      平台: "未填写",
      评论原文: comment,
    };
    setStatus("正在分析单条评论，不会刷新下方看板...", "running");
    const result = await callGeminiWithRetry(apiKey, model, [fallback], "单条评论");
    const normalized = normalizeResult(result[0] || {}, fallback);
    renderSingleCommentResult(normalized);
    setStatus("单条评论分析完成。该结果仅用于临时判断，不会写入看板数据。", "success");
  } catch (error) {
    setStatus(error.message || "单条评论分析失败，请稍后重试。", "error");
  } finally {
    setAnalyzerBusy(false);
  }
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "未分类";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topLabels(rows, key, limit = 3) {
  return Object.entries(countBy(rows, key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label}${count}条`)
    .join("；");
}

function groupRows(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function firstUnique(rows, key, limit) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).slice(0, limit);
}

const NON_SELLING_KEYWORDS = [
  "不足",
  "待优化",
  "待完善",
  "希望",
  "建议",
  "缺少",
  "缺乏",
  "无法",
  "不能",
  "不好",
  "异常",
  "问题",
  "担忧",
  "限制",
  "影响",
  "修复",
  "卡顿",
  "报错",
  "误判",
  "风险",
];

function isCleanSellingPoint(row) {
  if (row["用户态度"] !== "正向") return false;
  const label = String(row["二级标签"] || "");
  if (NON_SELLING_KEYWORDS.some((keyword) => label.includes(keyword))) return false;

  const feedback = String(row["具体反馈点"] || "");
  const evidence = String(row["原文证据"] || "");
  const isRequest = /(希望|建议|能不能|可不可以|需要|增加|改进|优化|修复)/.test(feedback + evidence);
  const isProblemLike = /(缺乏|不足|无法|不能|问题|异常|待优化|待完善|影响|限制|修复)/.test(feedback);
  return !(isRequest && isProblemLike);
}

function sellingPrimaryWeight(primaryIssue) {
  if (primaryIssue === "效果感知") return 3;
  if (primaryIssue === "使用体验") return 2;
  if (primaryIssue === "产品认知") return 1;
  return 0;
}

function buildDashboardData(rows, totalCount) {
  const evidence = rows.filter((row) => row["有效反馈"] !== "否");
  const usefulRows = evidence.length ? evidence : rows;
  const productGroups = groupRows(rows, (row) => `${row["产品代号"]}||${row["产品名称"]}`);
  const validGroups = groupRows(usefulRows, (row) => `${row["产品代号"]}||${row["产品名称"]}`);

  const products = Object.entries(productGroups).map(([key, productRows]) => {
    const [code, name] = key.split("||");
    const validRows = validGroups[key] || [];
    const negativeCount = validRows.filter((row) => row["用户态度"] === "负向").length;
    const highCount = validRows.filter((row) => row["严重程度"] === "高").length;
    const purchaseCount = validRows.filter((row) => row["购买影响"] === "是").length;
    const total = productRows.length || 1;
    return {
      产品代号: code,
      产品名称: name,
      评论数: productRows.length,
      有效反馈数: validRows.length,
      负向数: negativeCount,
      高严重数: highCount,
      "涉及购买/复购数": purchaseCount,
      负向占比: negativeCount / total,
      高严重占比: highCount / total,
      购买影响占比: purchaseCount / total,
      Top一级问题: topLabels(validRows, "一级问题"),
      Top二级标签: topLabels(validRows, "二级标签"),
    };
  });

  const issueDistribution = [];
  products.forEach((product) => {
    const label = `${product["产品代号"]}｜${product["产品名称"]}`;
    const rowsForProduct = usefulRows.filter((row) => row["产品代号"] === product["产品代号"]);
    ["一级问题", "二级标签", "用户态度", "严重程度"].forEach((dimension) => {
      Object.entries(countBy(rowsForProduct, dimension)).forEach(([tag, count]) => {
        issueDistribution.push({
          产品: label,
          维度: dimension,
          标签: tag,
          数量: count,
          占比: rowsForProduct.length ? count / rowsForProduct.length : 0,
        });
      });
    });
  });

  const productTotals = products.reduce((acc, item) => {
    acc[item["产品代号"]] = item["评论数"] || 1;
    return acc;
  }, {});

  const issueGroups = groupRows(
    usefulRows.filter((row) => ["负向", "复杂"].includes(row["用户态度"])),
    (row) => `${row["产品代号"]}||${row["产品名称"]}||${row["一级问题"]}||${row["二级标签"]}`,
  );
  const issuePool = Object.values(issueGroups).map((group) => {
    const base = group[0];
    const negative = group.filter((row) => row["用户态度"] === "负向").length;
    const complex = group.filter((row) => row["用户态度"] === "复杂").length;
    const high = group.filter((row) => row["严重程度"] === "高").length;
    const purchase = group.filter((row) => row["购买影响"] === "是").length;
    return {
      产品代号: base["产品代号"],
      产品名称: base["产品名称"],
      一级问题: base["一级问题"],
      二级标签: base["二级标签"],
      问题数: group.length,
      产品内占比: group.length / (productTotals[base["产品代号"]] || 1),
      负向数: negative,
      高严重数: high,
      购买影响数: purchase,
      优化优先级分: group.length * 2 + high * 3 + purchase * 4 + negative * 2 + complex,
      代表证据: group.slice(0, 3).map((row) => `#${row["评论编号"]} ${row["原文证据"]}`).join("；"),
      可优化方向: firstUnique(group, "可优化方向", 2).join("；"),
    };
  });

  const sellingGroups = groupRows(
    usefulRows.filter(isCleanSellingPoint),
    (row) => `${row["产品代号"]}||${row["产品名称"]}||${row["一级问题"]}||${row["二级标签"]}`,
  );
  const sellingPool = Object.values(sellingGroups).map((group) => {
    const base = group[0];
    const purchase = group.filter((row) => row["购买影响"] === "是").length;
    const primaryWeight = sellingPrimaryWeight(base["一级问题"]);
    return {
      产品代号: base["产品代号"],
      产品名称: base["产品名称"],
      一级问题: base["一级问题"],
      二级标签: base["二级标签"],
      反馈数: group.length,
      产品内占比: group.length / (productTotals[base["产品代号"]] || 1),
      购买影响数: purchase,
      卖点价值分: group.length * 5 + purchase * 4 + primaryWeight,
      代表证据: group.slice(0, 3).map((row) => `#${row["评论编号"]} ${row["原文证据"]}`).join("；"),
      可转化表达方向: firstUnique(group, "可优化方向", 2).join("；"),
    };
  });

  return {
    overview: {
      总评论数: totalCount || rows.length,
      产品数量: products.length,
      有效反馈数: usefulRows.length,
    },
    products,
    issueDistribution,
    issuePool,
    sellingPool,
    evidence: usefulRows,
    fieldGuide: demoData.fieldGuide,
  };
}

function setAnalyzerBusy(isBusy) {
  ["runSample", "runAll", "runSingleComment", "uploadFile"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = isBusy;
  });
}

async function runAnalysis(limit) {
  if (PUBLIC_DEMO_MODE) {
    setStatus("公开演示版不开放上传分析，请在私有本地版中操作。", "demo");
    return;
  }
  let rows = [];
  try {
    const apiKey = $("geminiKey").value.trim();
    const model = $("geminiModel").value.trim();
    const batchSize = Math.max(1, Math.min(20, Number($("batchSize").value) || 5));
    if (!apiKey) throw new Error("请先填写 Gemini API Key。");
    if (!model) throw new Error("请先填写模型名称。");
    if (!importedRows.length) throw new Error("请先导入评论数据。");

    clearSingleComment(true);
    rows = getMappedRows(limit);
    if (!rows.length) throw new Error("没有读到有效评论，请检查字段映射。");

    setAnalyzerBusy(true);
    analyzedRows = [];
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const label = `第 ${start + 1}-${Math.min(start + batch.length, rows.length)} 条`;
      setStatus(`正在分析${label}，共 ${rows.length} 条...`, "running");
      const result = await callGeminiWithRetry(apiKey, model, batch, label);
      analyzedRows.push(...result.map((item, index) => normalizeResult(item, batch[index] || {})));
      if (start + batchSize < rows.length) {
        const waitSeconds = Math.round(BATCH_INTERVAL_MS / 1000);
        setStatus(`已完成${label}，${waitSeconds} 秒后继续下一批...`, "running");
        await sleep(BATCH_INTERVAL_MS);
      }
    }
    data = buildDashboardData(analyzedRows, rows.length);
    resetFilterState();
    refreshFilterOptions();
    renderAll();
    $("downloadAnalysis").disabled = false;
    setStatus(`分析完成：已生成 ${analyzedRows.length} 条结构化反馈，并刷新下方看板。`, "success");
  } catch (error) {
    if (analyzedRows.length) {
      data = buildDashboardData(analyzedRows, analyzedRows.length);
      resetFilterState();
      refreshFilterOptions();
      renderAll();
      $("downloadAnalysis").disabled = false;
      setStatus(
        `分析中断：已保留并刷新前 ${analyzedRows.length}${rows.length ? `/${rows.length}` : ""} 条结果，可先下载已完成部分。错误：${error.message || "请检查数据、API Key 或网络。"}`,
        "error",
      );
    } else {
      setStatus(error.message || "分析失败，请检查数据、API Key 或网络。", "error");
    }
  } finally {
    setAnalyzerBusy(false);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadAnalysisCsv() {
  if (PUBLIC_DEMO_MODE) {
    setStatus("公开演示版不开放结果下载，请在私有本地版中操作。", "demo");
    return;
  }
  if (!analyzedRows.length) return;
  const columns = ["评论编号", "产品代号", "产品名称", "平台", "一级问题", "二级标签", "用户态度", "严重程度", "购买影响", "有效反馈", "具体反馈点", "原文证据", "可优化方向"];
  const csv = [columns.join(","), ...analyzedRows.map((row) => columns.map((col) => csvEscape(row[col])).join(","))].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const prefix = uploadedFileBaseName ? `${uploadedFileBaseName}_` : "";
  link.download = `${prefix}AI用户反馈分析结果.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function cleanFileBaseName(fileName) {
  return String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
}

function bindAnalyzer() {
  if (PUBLIC_DEMO_MODE) {
    setPublicDemoMode();
    return;
  }
  $("uploadFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      clearSingleComment(true);
      setStatus("正在读取文件...", "running");
      importedRows = await readFile(file);
      uploadedFileBaseName = cleanFileBaseName(file.name);
      populateMapping(importedRows);
      renderImportPreview();
      setStatus(`已导入 ${importedRows.length} 条数据。请确认字段映射，然后先跑 5 条测试。`, "success");
    } catch (error) {
      setStatus(error.message || "文件读取失败。", "error");
    }
  });

  $("runSingleComment").addEventListener("click", runSingleCommentAnalysis);
  $("runSample").addEventListener("click", () => runAnalysis(5));
  $("runAll").addEventListener("click", () => runAnalysis());
  $("downloadAnalysis").addEventListener("click", downloadAnalysisCsv);
  $("useDemoData").addEventListener("click", () => {
    data = JSON.parse(JSON.stringify(demoData));
    importedRows = [];
    analyzedRows = [];
    uploadedFileBaseName = "";
    clearSingleComment(true);
    $("importPreview").innerHTML = "";
    $("previewNote").textContent = "";
    $("uploadFile").value = "";
    resetFilterState();
    refreshFilterOptions();
    renderAll();
    $("downloadAnalysis").disabled = true;
    setStatus("已恢复原始数据。", "success");
  });

  const savedKey = localStorage.getItem("gemini_feedback_api_key") || "";
  if (savedKey) $("geminiKey").value = savedKey;
  $("geminiKey").addEventListener("input", (event) => {
    localStorage.setItem("gemini_feedback_api_key", event.target.value.trim());
  });
}

function bindFilters() {
  refreshFilterOptions();

  $("filterProduct").addEventListener("change", (e) => {
    state.product = e.target.value;
    renderAll();
  });
  $("filterSentiment").addEventListener("change", (e) => {
    state.sentiment = e.target.value;
    renderEvidence();
  });
  $("filterSeverity").addEventListener("change", (e) => {
    state.severity = e.target.value;
    renderEvidence();
  });
  $("filterPurchase").addEventListener("change", (e) => {
    state.purchase = e.target.value;
    renderEvidence();
  });
  $("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    renderInsightCards("issueCards", data.issuePool, "issue");
    renderInsightCards("sellingCards", data.sellingPool, "selling");
    renderEvidence();
  });
  $("resetFilters").addEventListener("click", () => {
    resetFilterState();
    refreshFilterOptions();
    renderAll();
  });
}

function bindNav() {
  const links = Array.from(document.querySelectorAll(".nav-link"));
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

bindFilters();
bindAnalyzer();
bindNav();
renderAll();
