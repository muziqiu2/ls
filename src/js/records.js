// ==========================================
// 记录管理：表单、列表渲染、搜索筛选、行内编辑、滑动删除（带撤销）
// ==========================================
import { el, state } from './state.js';
import { saveRecords } from './storage.js';
import { formatDate, formatTime, escapeHtml, toDateTimeLocalValue } from './utils.js';
import { showToast } from './ui.js';
import { updateStatistics } from './stats.js';
import { updateChart } from './chart.js';
import { switchTab } from './swipe.js';

const PRESET_LOCATIONS = ['家里', '公司', '学校', '公共场所', '其他'];
const SWIPE_DELETE_TRIGGER = 90;   // 滑动超过该距离（px）触发删除
const UNDO_WINDOW_MS = 4000;       // 撤销窗口时长（毫秒）

// 待确认（可撤销）删除的记录
const pendingDeletes = [];

// ---------- 表单 ----------

/**
 * 设置时间输入框为当前时间（datetime-local 格式）
 */
export function setCurrentTime() {
  el.recordTimeInput.value = toDateTimeLocalValue(new Date());
}

/**
 * 处理地点选择变化，显示/隐藏自定义地点输入框
 */
export function handleLocationChange() {
  el.otherLocationContainer.classList.toggle('hidden', el.locationSelect.value !== '其他');
}

/**
 * 表单验证
 */
function validateForm() {
  if (el.recordTimeInput.value) {
    const inputDate = new Date(el.recordTimeInput.value);
    const now = new Date();

    if (isNaN(inputDate.getTime())) {
      return { isValid: false, message: '请输入有效的时间' };
    }
    if (inputDate > now) {
      return { isValid: false, message: '时间不能设置为未来' };
    }
  }

  if (el.locationSelect.value === '其他') {
    const otherLocation = el.otherLocationInput.value.trim();
    if (!otherLocation) return { isValid: false, message: '请输入其他地点名称' };
    if (otherLocation.length > 50) return { isValid: false, message: '地点名称不能超过50个字符' };
  }

  return { isValid: true, message: '' };
}

/**
 * 重置表单为默认值
 */
function resetForm() {
  setCurrentTime();
  el.locationSelect.value = '家里';
  el.typeSelect.value = '';
  el.notesInput.value = '';
  el.otherLocationInput.value = '';
  el.otherLocationContainer.classList.add('hidden');
}

/**
 * 显示提交成功动画
 */
function showSuccessAnimation() {
  const submitBtn = el.recordForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> 成功！';
  submitBtn.classList.add('bg-green-500');

  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.classList.remove('bg-green-500');
  }, 1500);
}

/**
 * 处理表单提交，添加新记录
 */
export async function handleFormSubmit(e) {
  e.preventDefault();

  const validationResult = validateForm();
  if (!validationResult.isValid) {
    showToast(validationResult.message, 'error');
    return;
  }

  const location = el.locationSelect.value === '其他'
    ? el.otherLocationInput.value.trim() || '其他'
    : el.locationSelect.value;
  const type = el.typeSelect.value;
  const notes = el.notesInput.value.trim();

  let recordTime;
  if (el.recordTimeInput.value) {
    recordTime = new Date(el.recordTimeInput.value).toISOString();
  } else {
    recordTime = new Date().toISOString();
  }

  const newRecord = { id: Date.now(), timestamp: recordTime, location, type, notes };

  state.records.unshift(newRecord);
  await saveRecords();

  resetForm();
  refreshAfterDataChange();
  showSuccessAnimation();
}

/**
 * 一键打卡：以「当前时间 · 家里」极简记录一次
 * 复用表单提交逻辑，保证与详细录入行为一致
 */
export async function quickLog() {
  const btn = document.getElementById('bigLogBtn');
  btn.classList.add('logged');
  setCurrentTime();          // 时间=现在
  el.locationSelect.value = '家里';
  el.typeSelect.value = '';
  el.notesInput.value = '';
  el.otherLocationInput.value = '';
  el.otherLocationContainer.classList.add('hidden');

  await handleFormSubmit({ preventDefault: () => {} });

  setTimeout(() => btn.classList.remove('logged'), 900);
}

// ---------- 搜索 / 筛选 ----------

export function toggleFilterContainer() {
  el.filterContainer.classList.toggle('hidden');
}

export function applyFilter() {
  renderRecords();
  el.filterContainer.classList.add('hidden');
  updateActiveFilters();
}

export function resetFilter() {
  el.startDateInput.value = '';
  el.endDateInput.value = '';
  renderRecords();
  updateActiveFilters();
}

export function handleSearch() {
  const searchTerm = el.searchInput.value.trim();
  el.clearSearchBtn.classList.toggle('hidden', !searchTerm);
  renderRecords();
}

export function clearSearch() {
  el.searchInput.value = '';
  el.clearSearchBtn.classList.add('hidden');
  renderRecords();
}

export function clearFilters() {
  el.startDateInput.value = '';
  el.endDateInput.value = '';
  renderRecords();
  updateActiveFilters();
}

function updateActiveFilters() {
  const startDate = el.startDateInput.value;
  const endDate = el.endDateInput.value;

  if (startDate || endDate) {
    el.activeFilters.classList.remove('hidden');

    let filterString = '';
    if (startDate && endDate) filterString = `${startDate} 至 ${endDate}`;
    else if (startDate) filterString = `从 ${startDate} 开始`;
    else if (endDate) filterString = `到 ${endDate} 结束`;

    el.filterText.textContent = filterString;
  } else {
    el.activeFilters.classList.add('hidden');
  }
}

/**
 * 设置默认日期范围（结束为今天，开始为一周前）
 */
export function setDefaultDates() {
  el.endDateInput.value = new Date().toISOString().split('T')[0];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  el.startDateInput.value = oneWeekAgo.toISOString().split('T')[0];
}

// ---------- 列表渲染 ----------

/**
 * 渲染记录列表（依据筛选与搜索条件）
 */
export function renderRecords() {
  const startDate = el.startDateInput.value ? new Date(el.startDateInput.value) : null;
  const endDate = el.endDateInput.value ? new Date(el.endDateInput.value) : null;
  const searchTerm = el.searchInput.value.trim().toLowerCase();

  const filteredRecords = state.records.filter(record => {
    const recordDate = new Date(record.timestamp);
    recordDate.setHours(0, 0, 0, 0);

    const matchesStart = !startDate || recordDate >= startDate;
    const matchesEnd = !endDate || recordDate <= endDate;
    const matchesSearch = !searchTerm ||
      (record.location && record.location.toLowerCase().includes(searchTerm)) ||
      (record.notes && record.notes.toLowerCase().includes(searchTerm)) ||
      (record.type && record.type.toLowerCase().includes(searchTerm));

    return matchesStart && matchesEnd && matchesSearch;
  });

  // 空状态（区分「无数据」与「筛选无结果」）
  if (filteredRecords.length === 0) {
    el.recordsList.innerHTML = '';

    const title = el.emptyState.querySelector('.empty-title');
    const desc = el.emptyState.querySelector('.empty-desc');
    const btn = el.emptyState.querySelector('button');

    if (state.records.length === 0) {
      if (title) title.textContent = '暂无排便记录';
      if (desc) desc.textContent = '点下方「打卡」一键记录今天的第一次';
    } else {
      if (title) title.textContent = '暂无符合条件的记录';
      if (desc) desc.textContent = '尝试调整筛选条件或清除搜索';
    }
    if (btn) btn.classList.toggle('hidden', state.records.length > 0);

    el.emptyState.classList.remove('hidden');
    el.recordsList.appendChild(el.emptyState);
    return;
  }

  el.emptyState.classList.add('hidden');

  // 增量更新：移除不再需要的记录
  const newRecordIds = new Set(filteredRecords.map(record => record.id));
  el.recordsList.querySelectorAll('.record-item').forEach(element => {
    if (!newRecordIds.has(parseInt(element.dataset.id))) {
      element.remove();
    }
  });

  // 更新或添加记录
  filteredRecords.forEach((record, index) => {
    const existing = el.recordsList.querySelector(`[data-id="${record.id}"]`);

    if (existing) {
      existing.replaceWith(createRecordElement(record));
    } else {
      const newElement = createRecordElement(record);
      const nextRecord = filteredRecords[index + 1];
      const nextElement = nextRecord
        ? el.recordsList.querySelector(`[data-id="${nextRecord.id}"]`)
        : null;
      if (nextElement) {
        el.recordsList.insertBefore(newElement, nextElement);
      } else {
        el.recordsList.appendChild(newElement);
      }
    }
  });
}

/**
 * 创建单个记录 DOM 元素（含滑动删除与行内编辑）
 */
function createRecordElement(record) {
  const recordDate = new Date(record.timestamp);
  const formattedDate = formatDate(recordDate);
  const formattedTime = formatTime(recordDate);

  const recordElement = document.createElement('div');
  recordElement.className = 'record-item relative overflow-hidden';
  recordElement.dataset.id = record.id;
  recordElement.innerHTML = `
    <!-- 左滑提示层 -->
    <div class="absolute inset-y-0 right-0 w-24 bg-danger flex items-center justify-center text-white pointer-events-none">
      <i class="fa-solid fa-trash text-xl"></i>
    </div>
    <div class="record-content relative">
      <div class="flex justify-between items-start">
        <div>
          <div class="flex items-center">
            <span class="font-bold text-neutral-dark text-lg">${formattedDate}</span>
            <span class="text-gray-500 ml-2 text-base">${formattedTime}</span>
          </div>
          <div class="mt-2 flex items-center">
            <i class="fa-solid fa-map-marker text-secondary mr-2 text-lg"></i>
            <span class="text-lg">${escapeHtml(record.location)}</span>
          </div>
          ${record.type ? `
            <div class="mt-2 flex items-center">
              <i class="fa-solid fa-tag text-accent mr-2 text-lg"></i>
              <span class="text-lg">${escapeHtml(record.type)}</span>
            </div>
          ` : ''}
          ${record.notes ? `
            <div class="mt-2 flex items-start">
              <i class="fa-solid fa-comment text-gray-400 mr-2 mt-1 text-lg"></i>
              <span class="text-gray-600 text-base">${escapeHtml(record.notes)}</span>
            </div>
          ` : ''}
        </div>
        <div class="flex space-x-2">
          <button class="edit-btn text-gray-400 hover:text-primary transition-colors p-3 rounded-full hover:bg-gray-100 active:scale-95" aria-label="编辑">
            <i class="fa-solid fa-pencil text-xl"></i>
          </button>
          <button class="delete-btn text-gray-400 hover:text-danger transition-colors p-3 rounded-full hover:bg-gray-100 active:scale-95" aria-label="删除">
            <i class="fa-solid fa-trash text-xl"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 行内编辑表单 -->
    <div class="record-edit hidden mt-3 pt-3 border-t border-gray-100 relative">
      <div class="space-y-3">
        <input type="datetime-local" class="ie-time input-field text-base" aria-label="时间">
        <select class="ie-location input-field text-base" aria-label="地点">
          <option value="家里">家里</option>
          <option value="公司">公司</option>
          <option value="学校">学校</option>
          <option value="公共场所">公共场所</option>
          <option value="其他">其他</option>
        </select>
        <div class="ie-other-wrap hidden">
          <input type="text" class="ie-other input-field text-base" placeholder="请输入地点" aria-label="其他地点">
        </div>
        <select class="ie-type input-field text-base" aria-label="类型">
          <option value="">请选择类型</option>
          <option value="正常">正常</option>
          <option value="干燥">干燥</option>
          <option value="稀便">稀便</option>
          <option value="腹泻">腹泻</option>
        </select>
        <textarea class="ie-notes input-field text-base" rows="2" placeholder="备注（可选）" aria-label="备注"></textarea>
        <div class="flex justify-end space-x-2">
          <button type="button" class="ie-cancel px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm active:scale-95">取消</button>
          <button type="button" class="ie-save btn-primary btn-sm">保存</button>
        </div>
      </div>
    </div>
  `;

  // ---- 行内编辑逻辑 ----
  const editEl = recordElement.querySelector('.record-edit');
  const ieTime = recordElement.querySelector('.ie-time');
  const ieLocation = recordElement.querySelector('.ie-location');
  const ieOtherWrap = recordElement.querySelector('.ie-other-wrap');
  const ieOther = recordElement.querySelector('.ie-other');
  const ieType = recordElement.querySelector('.ie-type');
  const ieNotes = recordElement.querySelector('.ie-notes');

  const isEditOpen = () => !editEl.classList.contains('hidden');
  const closeEdit = () => editEl.classList.add('hidden');

  function populateEdit() {
    const d = new Date(record.timestamp);
    ieTime.value = isNaN(d.getTime()) ? '' : toDateTimeLocalValue(d);
    const isPreset = PRESET_LOCATIONS.includes(record.location);
    ieLocation.value = isPreset ? record.location : '其他';
    ieOtherWrap.classList.toggle('hidden', ieLocation.value !== '其他');
    ieOther.value = isPreset ? '' : record.location;
    ieType.value = record.type || '';
    ieNotes.value = record.notes || '';
  }

  ieLocation.addEventListener('change', () => {
    ieOtherWrap.classList.toggle('hidden', ieLocation.value !== '其他');
  });

  recordElement.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isEditOpen()) {
      closeEdit();
    } else {
      populateEdit();
      editEl.classList.remove('hidden');
    }
  });

  recordElement.querySelector('.ie-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    closeEdit();
  });

  recordElement.querySelector('.ie-save').addEventListener('click', async (e) => {
    e.stopPropagation();
    const location = ieLocation.value === '其他'
      ? ieOther.value.trim() || '其他'
      : ieLocation.value;
    const type = ieType.value;
    const notes = ieNotes.value.trim();

    let timestamp = record.timestamp;
    if (ieTime.value) {
      const parsed = new Date(ieTime.value);
      if (!isNaN(parsed.getTime())) timestamp = parsed.toISOString();
    }

    const idx = state.records.findIndex(r => r.id === record.id);
    if (idx === -1) return;

    state.records[idx] = { ...state.records[idx], timestamp, location, type, notes };
    await saveRecords();
    refreshAfterDataChange();
    showToast('记录已更新！');
  });

  // ---- 删除逻辑（按钮 + 左滑均走可撤销删删） ----
  recordElement.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    triggerDeleteWithUndo(record);
  });

  // ---- 左滑删除手势 ----
  enableSwipeToDelete(recordElement, record, isEditOpen, closeEdit);

  return recordElement;
}

/**
 * 为记录元素启用左滑删除手势（事件级统一处理触摸与鼠标）
 */
function enableSwipeToDelete(recordElement, record, isEditOpen, closeEdit) {
  const contentEl = recordElement.querySelector('.record-content');
  let startX = 0;
  let isDragging = false;
  let currentDx = 0;

  function resetPosition() {
    contentEl.style.transition = 'transform 0.25s ease';
    contentEl.style.transform = 'translateX(0)';
    setTimeout(() => { contentEl.style.transition = ''; }, 260);
  }

  function onStart(e) {
    // 交互控件上不启动滑动；行内编辑展开时不启动
    if (e.target.closest('button,input,select,textarea,a')) return;
    if (isEditOpen()) { closeEdit(); return; }
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    isDragging = true;
    currentDx = 0;
  }

  function onMove(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = clientX - startX;
    currentDx = Math.min(0, dx); // 只允许左滑
    contentEl.style.transition = 'none';
    contentEl.style.transform = `translateX(${currentDx}px)`;
    if (e.cancelable) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (currentDx <= -SWIPE_DELETE_TRIGGER) {
      resetPosition();
      triggerDeleteWithUndo(record);
    } else {
      resetPosition();
    }
    currentDx = 0;
  }

  recordElement.addEventListener('touchstart', e => { onStart(e); e.stopPropagation(); }, { passive: true });
  recordElement.addEventListener('touchmove', onMove, { passive: false });
  recordElement.addEventListener('touchend', e => { onEnd(); e.stopPropagation(); }, { passive: true });
  recordElement.addEventListener('touchcancel', e => { isDragging = false; currentDx = 0; resetPosition(); e.stopPropagation(); });

  recordElement.addEventListener('mousedown', e => { onStart(e); e.stopPropagation(); });
  recordElement.addEventListener('mousemove', onMove);
  recordElement.addEventListener('mouseup', e => { onEnd(); e.stopPropagation(); });
  recordElement.addEventListener('mouseleave', e => { if (isDragging) { onEnd(); e.stopPropagation(); } });
}

// ---------- 删除（软删除 + 撤销） ----------

/**
 * 触发带撤销的删除：先从列表移除并刷新 UI，在撤销窗口内可恢复，超时后落盘保存
 */
function triggerDeleteWithUndo(record) {
  const originalIndex = state.records.findIndex(r => r.id === record.id);
  if (originalIndex === -1) return;

  state.records.splice(originalIndex, 1);
  refreshAfterDataChange();

  showToast('记录已删除', 'success', '撤销', () => undoDelete(record, originalIndex));

  pendingDeletes.push({
    record,
    originalIndex,
    timer: setTimeout(async () => {
      const i = pendingDeletes.findIndex(p => p.record.id === record.id);
      if (i !== -1) {
        pendingDeletes.splice(i, 1);
        await saveRecords(); // 撤销窗口结束，真正保存
      }
    }, UNDO_WINDOW_MS)
  });
}

/**
 * 撤销本次删除，恢复记录到原位置
 */
function undoDelete(record, originalIndex) {
  const i = pendingDeletes.findIndex(p => p.record.id === record.id);
  if (i !== -1) {
    clearTimeout(pendingDeletes[i].timer);
    pendingDeletes.splice(i, 1);
  }
  if (!state.records.some(r => r.id === record.id)) {
    state.records.splice(originalIndex, 0, record);
  }
  refreshAfterDataChange();
  showToast('已撤销删除');
}

// ---------- 图表联动 ----------

/**
 * 点击图表某一天 -> 切换到历史标签并按当日筛选
 * @param {CustomEvent} e detail.dateStr 为 YYYY-MM-DD
 */
export function onChartDayClick({ detail }) {
  if (!detail || !detail.dateStr) return;

  el.startDateInput.value = detail.dateStr;
  el.endDateInput.value = detail.dateStr;

  switchTab(0);
  renderRecords();
  updateActiveFilters();
  showToast(`已筛选 ${detail.dateStr} 的记录`, 'info');
}

// ---------- 内部辅助 ----------

/**
 * 数据变更后刷新列表、统计与图表
 */
function refreshAfterDataChange() {
  renderRecords();
  updateStatistics();
  updateChart();
  refreshTodayCount();
}

/**
 * 刷新打卡页「今日已记录 N 次」计数
 */
function refreshTodayCount() {
  const badge = document.getElementById('todayCount');
  if (!badge) return;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const count = state.records.filter(r => {
    const d = new Date(r.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey;
  }).length;
  badge.textContent = String(count);
}