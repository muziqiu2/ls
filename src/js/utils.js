// ==========================================
// 通用工具函数（不依赖任何其他模块/DOM 状态）
// ==========================================

/**
 * 格式化日期（完整格式 YYYY-MM-DD）
 */
export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期（简短格式 MM-DD）
 */
export function formatDateShort(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * 把 <input type="date"> 的 "YYYY-MM-DD" 解析为「本地零点」的 Date
 *
 * 不要用 new Date('2026-09-20')：HTML 日期字符串按 UTC 解析，东八区会得到
 * 当天早上 8 点；而记录时间被归零到本地零点后与之比较，起始日当天会被判为
 * 不满足条件而整体漏掉。
 *
 * @returns {Date|null} 非法输入返回 null
 */
export function parseLocalDate(value) {
  if (typeof value !== 'string') return null;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!matched) return null;
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 格式化时间（HH:MM）
 */
export function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 生成 datetime-local 输入框所需的本地时间值（YYYY-MM-DDTHH:MM）
 * 注意：不能用 date.toISOString()（它返回的是 UTC），否则在非 UTC 时区
 * 会给输入框回填错误的时间（如东八区会相差 8 小时）。
 */
export function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * HTML 转义函数，防止 XSS 攻击
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 按某个字段统计出现次数（地点分布等，原先在 stats/chart 里各写一遍）
 * @param {Array} records
 * @param {(record: any) => string} selector
 * @returns {Object<string, number>}
 */
export function countBy(records, selector) {
  const counts = {};
  records.forEach(record => {
    const key = selector(record);
    if (key === undefined || key === null || key === '') return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

/**
 * 简易防抖：在停止调用 wait 毫秒后才真正执行
 * 用于搜索输入，避免每敲一个字符就全量重渲染列表。
 */
export function debounce(fn, wait = 200) {
  let timer = null;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

/**
 * 生成图表配色数组（用于饼图）
 *
 * 超过预置数量时按黄金角均分色相生成，保证：
 * 1. 颜色稳定 —— 刷新页面配色不会变（原先用 Math.random() 每次都不同）；
 * 2. 色值合法 —— 始终是 6 位十六进制（原先 toString(16) 缺前导零会产出
 *    '#abc12' 这类 5 位非法色值，饼图再拼透明度后彻底失效）。
 */
export function generateRandomColors(count) {
  const preset = [
    '#4ade80', // 绿色
    '#60a5fa', // 蓝色
    '#fbbf24', // 黄色
    '#f472b6', // 粉色
    '#a78bfa', // 紫色
    '#fb923c', // 橙色
    '#ef4444', // 红色
    '#06b6d4', // 青色
    '#84cc16', // 浅绿色
    '#ec4899'  // 玫红色
  ];

  const total = Math.max(0, Number(count) || 0);
  const colors = preset.slice(0, total);

  for (let i = preset.length; i < total; i++) {
    colors.push(hslToHex((i * 137.508) % 360, 65, 55));
  }

  return colors;
}

/**
 * HSL 转 6 位十六进制色值（内部使用）
 */
function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const toHex = (n) => Math.round(255 * channel(n)).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}