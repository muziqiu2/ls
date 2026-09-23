// ==========================================
// 趋势图表（Chart.js 封装）
// ==========================================
import { el, state } from './state.js';
import { formatDate, formatDateShort, generateRandomColors, countBy } from './utils.js';

// 当前图表范围内（已过滤）的记录，供 tooltip / 点击交互使用
let chartRangeRecords = [];

// 「完整日期 YYYY-MM-DD」-> 该日记录，作为唯一数据键
// 不能只按 MM-DD 聚合：2025-09-20 与 2026-09-20 会被合并计数，用满一年即失真。
let chartRecordsMap = {};

// 与 chart.data.labels 一一对应，保存每个刻度对应的完整日期
let chartLabelKeys = [];

const CHART_LINE_COLOR = 'rgba(5, 150, 105, 1)';
const CHART_FILL_COLOR = 'rgba(5, 150, 105, 0.2)';
// x 轴刻度字号，measureTickLabelWidth() 与 ticks.font 都引用它，改一处即可
const TICK_FONT_SIZE = 11;
const TICK_FONT = `${TICK_FONT_SIZE}px sans-serif`;

// 图表文字/网格色按主题切换。
// Chart.js 默认 color 是 #666、borderColor 是 rgba(0,0,0,.1)：在深色卡片(#374151)上
// 图例与刻度只有约 1.8:1，且网格线几乎看不见。这些内容画在 canvas 里，
// CSS 对比度审查覆盖不到，必须在这里单独适配。
const CHART_THEME = {
  light: { text: '#4b5563', grid: 'rgba(15, 23, 42, 0.10)' },
  dark: { text: '#e5e7eb', grid: 'rgba(255, 255, 255, 0.16)' },
};

function currentChartTheme() {
  return document.body.classList.contains('dark') ? CHART_THEME.dark : CHART_THEME.light;
}

/**
 * 把当前主题的文字/网格色应用到图表实例（图例、两轴刻度、网格线）。
 * @param {import('chart.js').Chart} [chart] 不传则用 state.trendChart
 */
export function applyChartTheme(chart = state.trendChart) {
  if (!chart) return;
  const { text, grid } = currentChartTheme();
  const opts = chart.options;

  if (opts.plugins?.legend) {
    opts.plugins.legend.labels = { ...(opts.plugins.legend.labels || {}), color: text };
  }
  // 饼图把两轴都 display:false 了，不要往隐藏轴上塞颜色
  if (opts.scales?.x && opts.scales.x.display !== false) {
    opts.scales.x.ticks = { ...opts.scales.x.ticks, color: text };
  }
  if (opts.scales?.y && opts.scales.y.display !== false) {
    opts.scales.y.ticks = { ...opts.scales.y.ticks, color: text };
    opts.scales.y.grid = { ...opts.scales.y.grid, color: grid };
  }
  chart.update('none');
}

/** y 轴配置（含主题色），与 buildXAxisTicks 一样每次更新都要带上，否则会退回默认 #666 */
function yAxisOptions() {
  const { text, grid } = currentChartTheme();
  return { beginAtZero: true, ticks: { stepSize: 1, color: text }, grid: { color: grid } };
}

/**
 * 初始化图表，创建 Chart.js 实例
 * @param {string} [type] 初始类型；默认取下拉框当前值，避免「先按 line 建、再改成 pie」导致图例错位
 */
export function initChart(type) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  // chart.umd.min.js 由 <script> 同步加载；若加载失败，这里要降级而不是让整页初始化中断
  if (typeof window.Chart === 'undefined') {
    console.error('Chart.js 未加载，趋势图不可用');
    const tip = document.createElement('p');
    tip.className = 'text-center text-sm text-gray-400 py-8';
    tip.textContent = '图表组件加载失败，请刷新页面重试';
    canvas.replaceWith(tip);
    return;
  }

  const initialType = type || el.chartTypeSelect?.value || 'line';
  const ctx = canvas.getContext('2d');

  state.trendChart = new window.Chart(ctx, {
    type: initialType,
    data: {
      labels: [],
      datasets: [{
        label: '排便次数',
        data: [],
        backgroundColor: CHART_FILL_COLOR,
        borderColor: CHART_LINE_COLOR,
        borderWidth: 2,
        pointBackgroundColor: CHART_LINE_COLOR,
        pointRadius: 4,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: items => items[0]?.label ?? '',
            label: context => `排便次数: ${context.raw}`
          }
        }
      },
      scales: {
        x: buildXAxisTicks(canvas),
        y: yAxisOptions()
      },
      onClick: handleChartClick
    }
  });

  updateChart();
  // 图例文字画在 canvas 里，初始化完补一次主题色
  applyChartTheme(state.trendChart);
}

/**
 * x 轴刻度策略：移动端画布只有 ~350px，14 个 "09-10" 标签会互相重叠。
 * 用离屏 canvas 实测「本次实际标签」的最大宽度，再算横向能放下几个，交给 Chart.js 的 autoSkip 抽稀。
 * （之前完全没有配置，Chart.js 会把标签斜排到 50°，在窄屏上仍互相压住。）
 */
function measureTickLabelWidth(labels) {
  const samples = (labels && labels.length) ? labels : ['00-00'];
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = TICK_FONT; // 与 ticks.font 保持一致
  return Math.max(...samples.map(t => Math.ceil(probe.measureText(t).width)));
}

function buildXAxisTicks(canvas, labels) {
  const cssWidth = (canvas && canvas.clientWidth) || 350;
  const labelWidth = measureTickLabelWidth(labels);
  const GAP = 12; // 相邻标签之间至少留的间距
  const maxTicksLimit = Math.max(3, Math.min(14, Math.floor((cssWidth - 8) / (labelWidth + GAP))));
  return {
    grid: { display: false },
    ticks: {
      autoSkip: true,
      autoSkipPadding: GAP,
      maxTicksLimit,
      maxRotation: 0,   // 不旋转，避免斜排后仍互相压住
      minRotation: 0,
      font: { size: TICK_FONT_SIZE },
      color: currentChartTheme().text,
    },
  };
}

/**
 * 处理图表点击：折线/柱状图点击某一天时，通知外部查看当日记录
 */
function handleChartClick(event, elements, chart) {
  if (!elements.length) return;
  if (chart && chart.config && chart.config.type === 'pie') return; // 饼图为地点分布，不触发

  const index = elements[0].index;
  const dateKey = chartLabelKeys[index]; // 完整日期
  if (!dateKey) return;

  const dayRecords = chartRangeRecords.filter(r => formatDate(new Date(r.timestamp)) === dateKey);
  if (!dayRecords.length) return;

  window.dispatchEvent(new CustomEvent('chart-day-click', { detail: { dateStr: dateKey } }));
}

/**
 * 根据选择的图表类型和时间范围动态更新图表数据
 */
export function updateChart() {
  const chart = state.trendChart;
  if (!chart) return;

  if (state.records.length === 0) {
    chart.data.labels = [];
    chart.data.datasets = [];
    chartLabelKeys = [];
    chartRangeRecords = [];
    chartRecordsMap = {};
    chart.update();
    return;
  }

  const chartType = el.chartTypeSelect.value;
  const range = getDateRangeInfo();               // 只计算一次（原先每次更新都要算两遍）
  const filteredRecords = filterRecordsByDate(state.records, range.startDate);

  chartRangeRecords = filteredRecords;
  chartRecordsMap = {};
  filteredRecords.forEach(record => {
    const dateKey = formatDate(new Date(record.timestamp)); // 完整日期作键
    if (!chartRecordsMap[dateKey]) chartRecordsMap[dateKey] = [];
    chartRecordsMap[dateKey].push(record);
  });

  // Chart.js 不支持运行时改 chart.config.type：控制器与图例会残留旧类型，
  // 表现为「切到饼图后图例只显示一条『排便地点分布』，没有各地点的颜色说明」。
  // 补刷 update 也无效（图例项被缓存），所以直接按新类型重建实例。
  if (chart.config.type !== chartType) {
    chart.destroy();
    initChart(chartType);
    return;
  }

  if (chartType === 'pie') {
    generatePieChartData(filteredRecords);
  } else {
    generateLineBarChartData(filteredRecords, chartType, range);
  }

  chart.update();
}

/**
 * 获取日期范围信息
 * @returns {{today: Date, startDate: Date|null, dates: Date[]}} dates 为该范围内的每一天
 */
function getDateRangeInfo() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const timeRange = el.timeRangeSelect.value;
  let startDate = null;

  if (timeRange !== 'all') {
    startDate = new Date(today);
    startDate.setDate(today.getDate() - parseInt(timeRange, 10) + 1);
    startDate.setHours(0, 0, 0, 0);
  }

  const dates = [];
  const cursor = startDate ? new Date(startDate) : null;
  while (cursor && cursor <= today) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return { today, startDate, dates };
}

/**
 * 把日期数组转成 x 轴标签；跨年时带上年份，避免 01-05 这类标签重复出现
 */
function buildLabels(dates) {
  const years = new Set(dates.map(d => d.getFullYear()));
  const isMultiYear = years.size > 1;
  return dates.map(d => (isMultiYear ? formatDate(d).slice(2) : formatDateShort(d)));
}

/**
 * 根据时间范围过滤记录
 */
function filterRecordsByDate(records, startDate) {
  if (!startDate) return records;
  return records.filter(record => new Date(record.timestamp) >= startDate);
}

/**
 * 生成折线图或柱状图数据
 */
function generateLineBarChartData(records, chartType, range) {
  const chart = state.trendChart;

  // 确定实际开始日期（「全部」范围下从最早一条记录当天开始）
  let actualStartDate = range.startDate;
  if (!actualStartDate && records.length > 0) {
    actualStartDate = new Date(Math.min(...records.map(r => new Date(r.timestamp))));
    actualStartDate.setHours(0, 0, 0, 0);
  }

  const dates = [];
  if (actualStartDate) {
    const cursor = new Date(actualStartDate);
    while (cursor <= range.today) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  chartLabelKeys = dates.map(d => formatDate(d));
  const labelTexts = buildLabels(dates);

  const counts = chartLabelKeys.map(dateKey => (chartRecordsMap[dateKey] || []).length);

  chart.data.labels = labelTexts;
  chart.data.datasets = [{
    label: '排便次数',
    data: counts,
    backgroundColor: chartType === 'line' ? CHART_FILL_COLOR : 'rgba(5, 150, 105, 0.6)',
    borderColor: CHART_LINE_COLOR,
    borderWidth: 2,
    pointBackgroundColor: CHART_LINE_COLOR,
    pointRadius: 4,
    tension: chartType === 'line' ? 0.3 : 0,
    fill: chartType === 'line'
  }];

  chart.options.plugins.tooltip.callbacks.title = items => {
    const dateKey = chartLabelKeys[items[0]?.dataIndex] || '';
    const recordsOfDay = chartRecordsMap[dateKey] || [];
    return recordsOfDay.length ? `${dateKey}（${recordsOfDay.length}条记录）` : dateKey;
  };
  chart.options.plugins.tooltip.callbacks.label = context => {
    const dateKey = chartLabelKeys[context.dataIndex] || '';
    const recordsOfDay = chartRecordsMap[dateKey] || [];
    const notes = recordsOfDay.filter(r => r.notes).map(r => r.notes);
    const notesText = notes.length ? `\n${notes.map(n => `• ${n}`).join('\n')}` : '';
    return `排便次数: ${context.raw}${notesText}`;
  };
  chart.options.scales = {
    x: buildXAxisTicks(chart.canvas, chart.data.labels),
    y: yAxisOptions()
  };
}

/**
 * 生成饼图数据（按地点统计）
 */
function generatePieChartData(records) {
  const chart = state.trendChart;
  const locationCounts = countBy(records, record => record.location || '未填写');

  // 按次数降序，配色稳定不跳变
  const entries = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(e => e[0]);
  const counts = entries.map(e => e[1]);
  const colors = generateRandomColors(labels.length);

  chart.data.labels = labels;
  chart.data.datasets = [{
    label: '排便地点分布',
    data: counts,
    backgroundColor: colors.map(color => color + '80'), // 添加透明度
    borderColor: colors,
    borderWidth: 1
  }];

  chartLabelKeys = [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  chart.options.plugins.tooltip.callbacks.title = items => items[0]?.label ?? '';
  chart.options.plugins.tooltip.callbacks.label = context => {
    const percentage = total ? ((context.raw / total) * 100).toFixed(1) : '0.0';
    return `${context.label}: ${context.raw}次 (${percentage}%)`;
  };

  chart.options.scales = { x: { display: false }, y: { display: false } };
}
