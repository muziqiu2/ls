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
 * 计算连续记录天数（从今天或昨天往前累计），夜班不过零点不中断
 */
function calcStreak(records) {
  if (records.length === 0) return 0;

  const daySet = new Set(records.map(r => dateKey(new Date(r.timestamp))));
  const today = dateKey(new Date());
  const yesterday = today - DAY_MS;

  let cursor = daySet.has(today) ? today
    : daySet.has(yesterday) ? yesterday
    : -1;

  if (cursor === -1) return 0;

  let streak = 0;
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
 */
function buildRegularity(records) {
  if (records.length === 0) {
    return { level: 'empty', text: '还没有记录。坚持排便并记录，才能逐步看清规律。', color: 'bg-neutral' };
  }
  if (records.length < 4) {
    return { level: 'low', text: '记录偏少，建议继续积累至少一周数据，再评估规律性。', color: 'bg-amber-50 border border-amber-200 text-amber-800' };
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
      level: 'frequent',
      text: '排便偏频繁（平均约每 ' + avg.toFixed(1) + ' 天一次）。注意辛辣生冷饮食和肠道健康，必要时就医。',
      color: 'bg-orange-50 border border-orange-200 text-orange-800'
    };
  }
  if (avg > 2) {
    return {
      level: 'infrequent',
      text: '排便偏少（平均约每 ' + avg.toFixed(1) + ' 天一次）。多喝水、多吃膳食纤维，适量运动有助于改善。',
      color: 'bg-orange-50 border border-orange-200 text-orange-800'
    };
  }
  if (regularCount >= 0.7 && stddev <= 1.2) {
    return {
      level: 'regular',
      text: '排便非常规律（平均约每 ' + avg.toFixed(1) + ' 天一次，波动小）。保持现在的饮食作息习惯！',
      color: 'bg-green-50 border border-green-200 text-green-800'
    };
  }
  return {
    level: 'varied',
    text: '间隔波动较大（平均约每 ' + avg.toFixed(1) + ' 天一次）。尝试固定三餐时间、规律作息，通常能改善。',
    color: 'bg-amber-50 border border-amber-200 text-amber-800'
  };
}

/**
 * 刷新规律洞察区域
 */
export function updateInsights() {
  const streak = calcStreak(state.records);
  el.streakCountElement.textContent = String(streak);

  const { thisWeek, lastWeek } = calcWeekCompare(state.records);
  if (lastWeek === 0) {
    el.weekCompareElement.textContent = thisWeek;
    el.weekCompareMetaElement.textContent = '上周无记录';
  } else {
    const diff = thisWeek - lastWeek;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    el.weekCompareElement.textContent = `${arrow} ${Math.abs(diff)}`;
    el.weekCompareMetaElement.textContent = `${thisWeek}/${lastWeek} 次`;
    el.weekCompareElement.style.color = diff > 0 ? '' : diff < 0 ? '' : '';
    el.weekCompareElement.style.color = diff < 0 ? '#38bdf8' : diff === 0 ? '' : '#fbbf24';
  }

  const regularity = buildRegularity(state.records);
  el.regularityBoxElement.className = `rounded-lg p-3 text-sm ${regularity.color}`;
  el.regularityTextElement.textContent = regularity.text;
}