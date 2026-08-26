// ==========================================
// UI 通用组件（Toast 提示 + 通用确认模态框 + 遮罩点击）
// ==========================================
import { el, state } from './state.js';

/**
 * 显示通用提示
 * @param {string} message 提示信息
 * @param {string} type 类型：success | error | info
 */
export function showToast(message, type = 'success') {
  el.toastText.textContent = message;

  if (type === 'success') {
    el.toastIcon.className = 'fa-solid fa-check-circle';
    el.toast.style.backgroundColor = '#10b981';
  } else if (type === 'error') {
    el.toastIcon.className = 'fa-solid fa-exclamation-circle';
    el.toast.style.backgroundColor = '#ef4444';
  } else if (type === 'info') {
    el.toastIcon.className = 'fa-solid fa-info-circle';
    el.toast.style.backgroundColor = '#3b82f6';
  }

  el.toast.classList.remove('translate-y-20', 'opacity-0');

  // 3 秒后隐藏
  setTimeout(() => {
    el.toast.classList.add('translate-y-20', 'opacity-0');
  }, 3000);
}

/**
 * 显示通用确认模态框
 * @param {Object} options
 * @param {string} options.title 标题
 * @param {string} options.message 消息内容
 * @param {string} options.icon 图标类名（可选）
 * @param {string} options.iconColor 图标颜色（可选）
 * @param {boolean} options.danger 是否为危险操作（控制按钮颜色）
 * @param {Function} options.onConfirm 确认回调
 */
export function showConfirmModal(options) {
  el.confirmTitle.textContent = options.title || '确认操作';
  el.confirmMessage.textContent = options.message || '';

  if (options.icon) {
    el.confirmIcon.className = options.icon;
  } else {
    el.confirmIcon.className = 'fa-solid fa-exclamation-triangle';
  }

  if (options.iconColor) {
    el.confirmIcon.style.color = options.iconColor;
  } else {
    el.confirmIcon.style.color = '#eab308'; // yellow-500
  }

  el.confirmOkBtn.className = options.danger ? 'btn-danger' : 'btn-primary';
  state.confirmCallback = options.onConfirm || null;

  el.confirmModal.classList.remove('hidden');
}

/**
 * 关闭通用确认模态框
 */
export function closeConfirmModal() {
  el.confirmModal.classList.add('hidden');
  state.confirmCallback = null;
}

/**
 * 处理确认按钮点击
 */
export function handleConfirmOk() {
  if (state.confirmCallback && typeof state.confirmCallback === 'function') {
    state.confirmCallback();
  }
  closeConfirmModal();
}

/**
 * 处理模态框遮罩层点击事件（点击遮罩关闭对应的模态框）
 * @param {Event} e 点击事件对象
 */
export function handleModalOverlayClick(e) {
  if (e.target !== e.currentTarget) return;

  e.currentTarget.classList.add('hidden');
  if (e.currentTarget === el.deleteModal) {
    state.currentRecordId = null;
  } else if (e.currentTarget === el.editModal) {
    state.currentEditRecordId = null;
  } else if (e.currentTarget === el.confirmModal) {
    state.confirmCallback = null;
  }
}