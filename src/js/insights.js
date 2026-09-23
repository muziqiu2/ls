// ==========================================
// 规律洞察：连续天数 / 周对比 / 规律度与健康建议
// ==========================================
import { el, state } from './state.js';

const DAY_MS = 1000 * 60 * 60 * 24;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  return startOfDay(date).getTime();
}

function getWeekStart(today = new Date()) {
  const start = startOfDay(today);
  const day = start.getDay(); // 0=周日
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

/**
 * 计算连续记录天数：从今天（或昨天）起按自然日逐日向前累计。
 * 只要某天有任意一条记录即算「已记录」，因此跨天的记录不会中断计数。
 */
function calcStreak(records) {
  if (records.length === 0) return 0;

  const daySet = new Set(
    records
      .map(r => new Date(r.timestamp))
      .filter(d => !isNaN(d.getTime()))
      .map(dateKey)
  );

  const today = dateKey(new Date());
  const yesterday = today - DAY_MS;

  const cursorStart = daySet.has(today) ? today
    : daySet.has(yesterday) ? yesterday
    : -1;

  if (cursorStart === -1) return 0;

  let streak = 0;
  let cursor = cursorStart;
  while (daySet.has(cursor)) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

/**
 * 计算本周次数与上周次数
 */
function calcWeekCompare(records) {
  const today = new Date();
  const weekStart = getWeekStart(today);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const thisWeek = records.filter(r => {
    const t = new Date(r.timestamp);
    return t >= weekStart && t < weekEnd;
  }).length;
  const lastWeek = records.filter(r => {
    const t = new Date(r.timestamp);
    return t >= lastWeekStart && t < weekStart;
  }).length;

  return { thisWeek, lastWeek };
}

/**
 * 计算规律度并给出健康建议
 * @returns {{level: string, text: string}} level 用于取样式类（见 app.css 的 .reg-*）
 */
function buildRegularity(records) {
  if (records.length === 0) {
    return { level: 'empty', text: '还没有记录。坚持排便并记录，才能逐步看清规律。' };
  }
  if (records.length < 4) {
    return {
      level: 'warn',
      text: '记录偏少，建议继续积累至少一周数据，再评估规律性。'
    };
  }

  const sorted = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp)) / DAY_MS);
  }

  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance = intervals.reduce((s, v) => s + (v - avg) * (v - avg), 0) / intervals.length;
  const stddev = Math.sqrt(variance);

  // 正常范围内：平均间隔 0.6~2 天，且波动小
  const regularCount = intervals.filter(v => v >= 0.6 && v <= 2).length / intervals.length;

  if (avg < 0.6) {
    return {
      level: 'warn',
      text: '排便偏频繁（平均约每 ' + avg.toFixed(1) + ' 天一次）。注意辛辣生冷饮食和肠道健康，必要时就医。'
    };
  }
  if (avg > 2) {
    return {
      level: 'warn',
      text: '排便偏少（平均约每 ' + avg.toFixed(1) + ' 天一次）。多喝水、多吃膳食纤维，适量运动有助于改善。'
    };
  }
  if (regularCount >= 0.7 && stddev <= 1.2) {
    return {
      level: 'good',
      text: '排便非常规律（平均约每 ' + avg.toFixed(1) + ' 天一次，波动小）。保持现在的饮食作息习惯！'
    };
  }
  return {
    level: 'warn',
    text: '间隔波动较大（平均约每 ' + avg.toFixed(1) + ' 天一次）。尝试固定三餐时间、规律作息，通常能改善。'
  };
}

/**
 * 刷新规律洞察区域
 */
export function updateInsights() {
  const streak = calcStreak(state.records);
  if (el.streakCountElement) el.streakCountElement.textContent = String(streak);

  const { thisWeek, lastWeek } = calcWeekCompare(state.records);
  if (!lastWeek) {
    el.weekCompareElement.textContent = String(thisWeek);
    el.weekCompareMetaElement.textContent = '上周无记录';
    el.weekCompareElement.classList.remove('wc-up', 'wc-down');
  } else {
    const diff = thisWeek - lastWeek;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    el.weekCompareElement.textContent = `${arrow} ${Math.abs(diff)}`;
    el.weekCompareMetaElement.textContent = `${thisWeek}/${lastWeek} 次`;
    // 用 CSS 类而非行内颜色：行内样式无法随深色主题切换，深色下会变得难以辨认
    el.weekCompareElement.classList.toggle('wc-up', diff > 0);
    el.weekCompareElement.classList.toggle('wc-down', diff < 0);
  }

  const regularity = buildRegularity(state.records);
  el.regularityBoxElement.className = `regularity-box reg-${regularity.level}`;
  el.regularityTextElement.textContent = regularity.text;
}
