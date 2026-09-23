// ==========================================
// AI 洞察 · 本地摘要层（纯函数，无 DOM、无网络）
// ==========================================
// 设计原则：**大模型只负责「重新组织」本地已经算好的事实，不负责「产生」新事实。**
// 所以：
//   1. 所有数字在这里算好，模型只做措辞；
//   2. 只发送聚合特征，绝不发送备注原文、精确时间戳、自定义地点名。
// 这也让「发了什么」是可枚举、可展示给用户确认的（见 consentFields()）。

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

// 与 index.html 的下拉选项保持一致：不在这份白名单里的地点（用户手输的）
// 一律归入「其他」—— 自定义地点名可能包含医院、学校等可识别信息。
const LOCATION_WHITELIST = ['家里', '公司', '学校', '公共场所', '其他'];
const TYPE_ORDER = ['正常', '干燥', '稀便', '腹泻'];

// 时段划分：比 24 个裸小时更能体现「节律」，也省 token
const HOUR_SEGMENTS = [
  { label: '凌晨(0-5时)', from: 0, to: 5 },
  { label: '早晨(6-8时)', from: 6, to: 8 },
  { label: '上午(9-11时)', from: 9, to: 11 },
  { label: '下午(12-17时)', from: 12, to: 17 },
  { label: '晚间(18-22时)', from: 18, to: 22 },
  { label: '深夜(23时)', from: 23, to: 23 },
];

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  return startOfDay(date).getTime();
}

/** 周一为一周第一天，与统计模块保持一致 */
function weekStartOf(date) {
  const s = startOfDay(date);
  const day = s.getDay();
  s.setDate(s.getDate() - (day === 0 ? 6 : day - 1));
  return s;
}

function round(n, digits = 1) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function validRecords(records) {
  return (records || [])
    .map(r => ({ ...r, _t: new Date(r.timestamp) }))
    .filter(r => !isNaN(r._t.getTime()));
}

/**
 * 把一段原始记录压缩成「可安全发送」的结构化摘要。
 *
 * @param {Array} records 记录列表
 * @param {Object} [options]
 * @param {number|'all'} [options.days=14] 观察窗口天数，与统计页「时间范围」一致
 * @param {Date} [options.now] 当前时间（注入以便测试）
 * @returns {Object} 摘要对象（键名直接作为 prompt 里可读的标签）
 */
export function buildSummary(records, { days = 14, now = new Date() } = {}) {
  const all = validRecords(records);
  const analyzeAll = days === 'all';

  let windowed = all;
  let from = null;
  if (!analyzeAll && Number(days) > 0) {
    from = startOfDay(new Date(now.getTime() - (Number(days) - 1) * DAY_MS));
    windowed = all.filter(r => r._t >= from);
  }

  const sorted = [...windowed].sort((a, b) => a._t - b._t);
  const to = all.length
    ? new Date(Math.max(now.getTime(), sorted.length ? sorted[sorted.length - 1]._t.getTime() : now.getTime()))
    : now;

  const summary = {
    观察窗口: analyzeAll ? '全部记录' : `最近 ${Number(days)} 天`,
    记录总数: sorted.length,
    已记录天数: new Set(sorted.map(r => dayKey(r._t))).size,
    覆盖天数: analyzeAll
      ? (from ? null : null)
      : Number(days),
  };

  // ---- 间隔统计（小时）----
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i]._t - sorted[i - 1]._t) / HOUR_MS);
  }
  if (intervals.length) {
    const asc = [...intervals].sort((a, b) => a - b);
    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - avg) * (v - avg), 0) / intervals.length;
    summary.间隔 = {
      平均小时: round(avg),
      中位小时: round(asc[Math.floor(asc.length / 2)]),
      最长小时: round(asc[asc.length - 1]),
      波动标准差小时: round(Math.sqrt(variance)),
      换算: `平均约每 ${round(avg / 24)} 天一次`,
    };
  } else {
    summary.间隔 = '样本不足（少于 2 条记录）';
  }

  // ---- 时段分布 ----
  const segmentCounts = {};
  HOUR_SEGMENTS.forEach(s => { segmentCounts[s.label] = 0; });
  sorted.forEach(r => {
    const h = r._t.getHours();
    const seg = HOUR_SEGMENTS.find(s => h >= s.from && h <= s.to);
    if (seg) segmentCounts[seg.label]++;
  });
  summary.时段分布 = segmentCounts;

  // ---- 星期分布 ----
  const weekdayCounts = {};
  WEEKDAYS.forEach(d => { weekdayCounts[d] = 0; });
  sorted.forEach(r => {
    const idx = (r._t.getDay() + 6) % 7; // 0=周一
    weekdayCounts[WEEKDAYS[idx]]++;
  });
  summary.星期分布 = weekdayCounts;

  // ---- 地点分布（自定义地点一律归入「其他」）----
  const locCounts = {};
  sorted.forEach(r => {
    const raw = String(r.location || '').trim();
    const safe = LOCATION_WHITELIST.includes(raw) ? raw : '其他';
    locCounts[safe] = (locCounts[safe] || 0) + 1;
  });
  summary.地点分布 = Object.entries(locCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ 地点: name, 次数: count }));

  // ---- 类型分布（只统计有填写的）----
  const typeCounts = {};
  sorted.forEach(r => {
    const t = String(r.type || '').trim();
    if (TYPE_ORDER.includes(t)) typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  summary.类型分布 = TYPE_ORDER
    .filter(t => typeCounts[t])
    .map(t => ({ 类型: t, 次数: typeCounts[t] }));

  // ---- 连续记录天数 ----
  const daySet = new Set(all.map(r => dayKey(r._t)));
  const today = dayKey(now);
  let cursor = daySet.has(today) ? today : daySet.has(today - DAY_MS) ? today - DAY_MS : -1;
  let streak = 0;
  while (cursor !== -1 && daySet.has(cursor)) {
    streak++;
    cursor -= DAY_MS;
  }
  summary.连续记录天数 = streak;

  // ---- 本周 / 上周 ----
  const ws = weekStartOf(now);
  const we = new Date(ws.getTime() + 7 * DAY_MS);
  const lws = new Date(ws.getTime() - 7 * DAY_MS);
  summary.本周次数 = all.filter(r => r._t >= ws && r._t < we).length;
  summary.上周次数 = all.filter(r => r._t >= lws && r._t < ws).length;

  // ---- 最近 N 天每日次数（最多 14 天，控制 token）----
  const dailyDays = Math.min(Number(analyzeAll ? 14 : days) || 14, 14);
  const daily = [];
  for (let i = dailyDays - 1; i >= 0; i--) {
    const d = startOfDay(new Date(now.getTime() - i * DAY_MS));
    const next = new Date(d.getTime() + DAY_MS);
    daily.push({
      日期: `${d.getMonth() + 1}/${d.getDate()}`,
      次数: all.filter(r => r._t >= d && r._t < next).length,
    });
  }
  summary.最近每日次数 = daily;

  // ---- 本地判定的信号（事实，不是结论）----
  const flags = [];
  const loose = (typeCounts['稀便'] || 0) + (typeCounts['腹泻'] || 0);
  if (loose >= 3) {
    flags.push(`窗口内出现 ${typeCounts['稀便'] || 0} 次稀便、${typeCounts['腹泻'] || 0} 次腹泻`);
  }
  if (intervals.length >= 4 && summary.间隔.波动标准差小时 > 29) {
    flags.push('记录间隔波动较大（标准差超过 29 小时）');
  }
  if (intervals.length >= 4 && summary.间隔.平均小时 < 14.4) {
    flags.push('平均间隔短于 14.4 小时（每天超过 1.6 次）');
  }
  if (intervals.length >= 4 && summary.间隔.平均小时 > 48) {
    flags.push('平均间隔长于 48 小时');
  }
  const coverage = summary.覆盖天数 ? summary.已记录天数 / summary.覆盖天数 : null;
  if (coverage !== null && coverage < 0.4) {
    flags.push(`记录较稀疏（${summary.已记录天数}/${summary.覆盖天数} 天有记录）`);
  }
  summary.可关注的信号 = flags.length ? flags : ['无明显异常信号'];
  summary.数据截止 = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;

  return summary;
}

/**
 * 摘要的稳定哈希（FNV-1a 32 位），用于结果缓存：
 * 摘要没变就不重复请求，省钱也省时间。
 */
export function summaryHash(summary) {
  const str = JSON.stringify(summary);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 缓存键：摘要 + 服务商 + 模型。换模型必须重算，否则会拿到别的模型的结果。
 */
export function cacheKeyOf(summary, { provider, model }) {
  return `${summaryHash(summary)}|${provider || ''}|${model || ''}`;
}

/**
 * 摘要里实际会发送的字段名，用于知情同意弹窗逐条列出。
 */
export function consentFields(summary) {
  const labels = {
    观察窗口: '观察的时间范围',
    记录总数: '记录总次数',
    已记录天数: '有记录的天数',
    覆盖天数: '窗口长度',
    间隔: '平均 / 中位 / 最长间隔与波动',
    时段分布: '各时段出现次数',
    星期分布: '周一到周日的分布',
    地点分布: '地点分布（自定义地点已归入「其他」）',
    类型分布: '性状类型分布',
    连续记录天数: '连续记录天数',
    本周次数: '本周次数',
    上周次数: '上周次数',
    最近每日次数: '最近每日次数',
    可关注的信号: '本地判定的异常信号',
    数据截止: '数据截止日期',
  };
  return Object.keys(summary).map(k => labels[k] || k);
}

export const SYSTEM_PROMPT = [
  '你是一名健康数据解读助手，服务于一个个人排便记录工具。',
  '',
  '严格遵守以下规则：',
  '1. 只能使用用户消息中 JSON 提供的数据。禁止引入 JSON 之外的数字、日期或事实，禁止推测用户的饮食、病史、用药。',
  '2. 不做医学诊断，不推荐任何药物，不判断病情严重程度。如发现需要关注的信号，只建议「必要时咨询医生」。',
  '3. 输出 2 至 4 段简短中文，总长度控制在 200 至 350 字。可以使用「- 」开头的列表。',
  '4. 不要输出 JSON、不要使用代码块、不要用 # 标题、不要逐条复述所有数字，只挑最有信息量的 3 到 5 个。',
  '5. 语气平实、不夸张、不制造焦虑。最后单独一行以「以上仅供参考，不构成医疗建议。」结尾。',
].join('\n');

/**
 * 组装发送给模型的消息
 */
export function buildMessages(summary) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        '以下是我最近一段时间的排便记录统计结果（JSON）。请据此写一段解读，',
        '指出规律、值得留意的地方，以及 1 到 2 条可操作的生活建议。',
        '',
        JSON.stringify(summary, null, 2),
      ].join('\n'),
    },
  ];
}
