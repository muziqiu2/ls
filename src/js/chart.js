// ==========================================
// 趋势图表（Chart.js 封装）
// ==========================================
import { el, state } from './state.js';
import { formatDate, formatDateShort, formatTime, generateRandomColors } from './utils.js';

// 当前图表范围内（已过滤）的记录及"日期标签 -> 记录"映射，供 tooltip / 点击交互使用
let chartRangeRecords = [];
let chartRecordsMap = {};

/**
 * 初始化图表，创建 Chart.js 实例
 */
export function initChart() {
  const ctx = document.getElementById('trendChart').getContext('2d');

  state.trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '排便次数',
        data: [],
        backgroundColor: 'rgba(74, 222, 128, 0.2)',
        borderColor: 'rgba(74, 222, 128, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(74, 222, 128, 1)',
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
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      },
      onClick: handleChartClick
    }
  });

  updateChart();
}

/**
 * 处理图表点击：折线/柱状图点击某一天时，通知外部查看当日记录
 */
function handleChartClick(event, elements, chart) {
  if (!elements.length) return;
  if (chart && chart.config && chart.config.type === 'pie') return; // 饼图为地点分布，不触发

  const index = elements[0].index;
  const label = chart.data.labels[index];
  const dayRecords = chartRangeRecords.filter(r => formatDateShort(new Date(r.timestamp)) === label);
  if (!dayRecords.length) return;

  const dateStr = formatDate(new Date(dayRecords[0].timestamp)); // YYYY-MM-DD
  window.dispatchEvent(new CustomEvent('chart-day-click', { detail: { dateStr } }));
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
    chart.update();
    return;
  }

  const chartType = el.chartTypeSelect.value;
  const { startDate } = getDateRangeInfo();
  const filteredRecords = filterRecordsByDate(state.records, startDate);

  // 记录当前范围内全部记录与「日期标签 -> 记录」映射，供 tooltip / 点击使用
  chartRangeRecords = filteredRecords;
  chartRecordsMap = {};
  filteredRecords.forEach(record => {
    const dateStr = formatDateShort(new Date(record.timestamp));
    if (!chartRecordsMap[dateStr]) chartRecordsMap[dateStr] = [];
    chartRecordsMap[dateStr].push(record);
  });

  if (chartType === 'line' || chartType === 'bar') {
    generateLineBarChartData(filteredRecords, chartType);
  } else if (chartType === 'pie') {
    generatePieChartData(filteredRecords);
  }

  chart.config.type = chartType;
  chart.update();
}

/**
 * 获取日期范围信息
 * @returns {{today: Date, startDate: Date|null, labels: string[]}}
 */
function getDateRangeInfo() {
  const today = new Date();
  const timeRange = el.timeRangeSelect.value;
  let startDate = null;
  const labels = [];

  if (timeRange !== 'all') {
    startDate = new Date(today);
    startDate.setDate(today.getDate() - parseInt(timeRange) + 1);
    startDate.setHours(0, 0, 0, 0);
  }

  const currentDate = startDate ? new Date(startDate) : null;
  while (currentDate && currentDate <= today) {
    labels.push(formatDateShort(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { today, startDate, labels };
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
function generateLineBarChartData(records, chartType) {
  const chart = state.trendChart;
  const dateCounts = {};
  const { today, startDate, labels } = getDateRangeInfo();

  // 确定实际开始日期（全部记录时使用最早的记录日期）
  let actualStartDate = startDate;
  if (!startDate && records.length > 0) {
    actualStartDate = new Date(Math.min(...records.map(r => new Date(r.timestamp))));
    actualStartDate.setHours(0, 0, 0, 0);
  }

  let chartLabels = labels;
  if (!startDate) {
    chartLabels = [];
    const currentDate = new Date(actualStartDate);
    while (currentDate <= today) {
      dateCounts[formatDateShort(currentDate)] = 0;
      chartLabels.push(formatDateShort(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    chartLabels.forEach(dateStr => { dateCounts[dateStr] = 0; });
  }

  records.forEach(record => {
    const dateStr = formatDateShort(new Date(record.timestamp));
    if (Object.prototype.hasOwnProperty.call(dateCounts, dateStr)) {
      dateCounts[dateStr]++;
    }
  });

  const counts = chartLabels.map(dateStr => dateCounts[dateStr] || 0);

  chart.data.labels = chartLabels;
  chart.data.datasets = [{
    label: '排便次数',
    data: counts,
    backgroundColor: chartType === 'line' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(74, 222, 128, 0.6)',
    borderColor: 'rgba(74, 222, 128, 1)',
    borderWidth: 2,
    pointBackgroundColor: 'rgba(74, 222, 128, 1)',
    pointRadius: 4,
    tension: chartType === 'line' ? 0.3 : 0,
    fill: chartType === 'line' ? true : false
  }];

  chart.options.plugins.tooltip.callbacks.title = items => {
    const label = items[0]?.label ?? '';
    const records = chartRecordsMap[label] || [];
    return records.length ? `${label}（${records.length}条记录）` : label;
  };
  chart.options.plugins.tooltip.callbacks.label = context => {
    const records = chartRecordsMap[context.label] || [];
    const notes = records.filter(r => r.notes).map(r => r.notes);
    const notesText = notes.length ? `\n${notes.map(n => `• ${n}`).join('\n')}` : '';
    return `排便次数: ${context.raw}${notesText}`;
  };
  chart.options.scales = {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { stepSize: 1 } }
  };
}

/**
 * 生成饼图数据（按地点统计）
 */
function generatePieChartData(records) {
  const chart = state.trendChart;
  const locationCounts = {};

  records.forEach(record => {
    const location = record.location;
    locationCounts[location] = (locationCounts[location] || 0) + 1;
  });

  const labels = Object.keys(locationCounts);
  const counts = Object.values(locationCounts);
  const colors = generateRandomColors(labels.length);

  chart.data.labels = labels;
  chart.data.datasets = [{
    label: '排便地点分布',
    data: counts,
    backgroundColor: colors.map(color => color + '80'), // 添加透明度
    borderColor: colors,
    borderWidth: 1
  }];

  chart.options.plugins.tooltip.callbacks.label = context => {
    const total = counts.reduce((sum, count) => sum + count, 0);
    const percentage = ((context.raw / total) * 100).toFixed(1);
    return `${context.label}: ${context.raw}次 (${percentage}%)`;
  };

  chart.options.scales = { x: { display: false }, y: { display: false } };
}