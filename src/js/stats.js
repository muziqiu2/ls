// ==========================================
// 统计信息（平均间隔 / 本周次数 / 常用地点）
// ==========================================
import { el, state } from './state.js';

/**
 * 计算并显示平均间隔、本周次数和常用地点
 */
export function updateStatistics() {
  if (state.records.length === 0) {
    el.avgIntervalElement.innerHTML = '<span class="text-gray-400">--</span>';
    el.weeklyCountElement.innerHTML = '<span class="text-gray-400">--</span>';
    el.commonLocationElement.innerHTML = '<span class="text-gray-400">--</span>';
    return;
  }

  // 平均间隔（仅当有 2 条以上记录时）
  if (state.records.length > 1) {
    const sortedRecords = [...state.records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let totalInterval = 0;
    for (let i = 1; i < sortedRecords.length; i++) {
      const prevTime = new Date(sortedRecords[i - 1].timestamp).getTime();
      const currTime = new Date(sortedRecords[i].timestamp).getTime();
      totalInterval += (currTime - prevTime) / (1000 * 60 * 60); // 小时
    }

    const avgInterval = totalInterval / (sortedRecords.length - 1);
    el.avgIntervalElement.textContent = avgInterval.toFixed(1);
  } else {
    el.avgIntervalElement.textContent = '--';
  }

  // 本周次数（周一作为本周第一天）
  const today = new Date();
  const weekStart = new Date(today);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(today.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  const weeklyRecords = state.records.filter(record => new Date(record.timestamp) >= weekStart);
  el.weeklyCountElement.textContent = weeklyRecords.length;

  // 常用地点
  const locationCounts = {};
  state.records.forEach(record => {
    const location = record.location;
    locationCounts[location] = (locationCounts[location] || 0) + 1;
  });

  let maxCount = 0;
  let commonLocation = '--';
  for (const location in locationCounts) {
    if (locationCounts[location] > maxCount) {
      maxCount = locationCounts[location];
      commonLocation = location;
    }
  }

  el.commonLocationElement.textContent = commonLocation;
}