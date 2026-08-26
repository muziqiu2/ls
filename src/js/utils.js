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
 * 生成随机颜色数组（用于饼图）
 */
export function generateRandomColors(count) {
  const colors = [
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

  // 需要的数量超过预定义颜色时，生成随机颜色
  while (colors.length < count) {
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
    colors.push(randomColor);
  }

  return colors.slice(0, count);
}