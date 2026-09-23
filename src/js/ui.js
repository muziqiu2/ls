// ==========================================
// UI 通用组件（Toast 提示 + 通用确认模态框 + 遮罩点击）
// ==========================================
import { el, state } from './state.js';

let toastTimer = null;
let toastActionCallback = null;

// 打开的模态框/抽屉计数，用于滚动锁（支持多个浮层叠加）
let openLayerCount = 0;

/**
 * 登记/释放一层浮层，并同步 body 的滚动锁类
 * 打开底部抽屉或模态框时锁住背景滚动，关闭后恢复。
 */
export function setLayerOpen(isOpen) {
  openLayerCount = Math.max(0, openLayerCount + (isOpen ? 1 : -1));
  document.body.classList.toggle('modal-open', openLayerCount > 0);
}

// 模态框元素 -> 正规关闭函数，供遮罩点击与 Esc 复用
const modalClosers = new Map();

/**
 * 注册模态框的关闭函数，保证遮罩点击 / Esc 都走同一条关闭路径
 * （直接改 classList 会漏掉回调清理等状态复位）
 */
export function registerModal(element, closeFn) {
  if (element) modalClosers.set(element, closeFn);
}

// Toast 配色：绿底白字对比度需 ≥4.5:1，因此用深色底而非亮绿
const TOAST_COLORS = {
  success: '#047857',
  error: '#b91c1c',
  info: '#1d4ed8',
};

/**
 * 显示通用提示
 * @param {string} message 提示信息
 * @param {string} type 类型：success | error | info
 * @param {string} [actionLabel] 可选的右侧动作按钮文案
 * @param {Function} [actionCallback] 动作按钮点击回调
 * @param {number} [duration] 展示时长（毫秒），默认 3.5s / 带动作时 5s
 */
export function showToast(message, type = 'success', actionLabel = null, actionCallback = null, duration = null) {
  if (toastTimer) clearTimeout(toastTimer);

  el.toastText.textContent = message;

  if (type === 'error') {
    el.toastIcon.className = 'fa-solid fa-exclamation-circle';
  } else if (type === 'info') {
    el.toastIcon.className = 'fa-solid fa-info-circle';
  } else {
    el.toastIcon.className = 'fa-solid fa-check-circle';
  }
  el.toast.style.backgroundColor = TOAST_COLORS[type] || TOAST_COLORS.success;

  const hasAction = typeof actionLabel === 'string' && actionLabel && typeof actionCallback === 'function';
  el.toastAction.textContent = actionLabel || '';
  el.toastAction.classList.toggle('hidden', !hasAction);
  toastActionCallback = hasAction ? actionCallback : null;

  el.toast.classList.remove('translate-y-20', 'opacity-0');

  // 带「撤销」的提示给用户更长的反应时间
  const ms = duration || (hasAction ? 5000 : 3500);
  toastTimer = setTimeout(hideToast, ms);
}

/**
 * 处理 Toast 动作按钮点击
 */
export function handleToastAction() {
  if (toastActionCallback) {
    const cb = toastActionCallback;
    toastActionCallback = null;
    cb();
  }
  hideToast();
}

/**
 * 隐藏 Toast（清空动作回调与按钮）
 */
export function hideToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  toastActionCallback = null;
  el.toastAction.classList.add('hidden');
  el.toast.classList.add('translate-y-20', 'opacity-0');
}

/**
 * 显示通用确认模态框
 * @param {Object} options
 * @param {string} options.title 标题
 * @param {string} options.message 消息内容
 * @param {string} options.icon 图标类名（可选）
 * @param {string} options.iconColor 图标颜色（可选）
 * @param {boolean} options.danger 是否为危险操作（控制按钮颜色）
 * @param {Function} options.onConfirm 确认回调（可返回 Promise）
 */
export function showConfirmModal(options) {
  el.confirmTitle.textContent = options.title || '确认操作';
  el.confirmMessage.textContent = options.message || '';

  el.confirmIcon.className = options.icon || 'fa-solid fa-exclamation-triangle';
  el.confirmIcon.style.color = options.iconColor || '#d97706'; // amber-600，白底上满足 3:1

  el.confirmOkBtn.className = options.danger ? 'btn-danger' : 'btn-primary';
  state.confirmCallback = options.onConfirm || null;

  el.confirmModal.classList.remove('hidden');
  setLayerOpen(true);
}

/**
 * 关闭通用确认模态框
 */
export function closeConfirmModal() {
  if (el.confirmModal.classList.contains('hidden')) return;
  el.confirmModal.classList.add('hidden');
  state.confirmCallback = null;
  setLayerOpen(false);
}

/**
 * 处理确认按钮点击
 * 回调可能是异步的（写库），失败要给出反馈而不是静默关闭。
 */
export async function handleConfirmOk() {
  const callback = state.confirmCallback;
  state.confirmCallback = null;

  if (typeof callback === 'function') {
    try {
      await callback();
    } catch (error) {
      console.error('确认操作执行失败：', error);
      showToast('操作失败：' + (error && error.message ? error.message : error), 'error');
      el.confirmModal.classList.add('hidden');
      setLayerOpen(false);
      return;
    }
  }
  closeConfirmModal();
}

/**
 * 处理模态框遮罩层点击事件（点击遮罩关闭对应的模态框）
 * @param {Event} e 点击事件对象
 */
export function handleModalOverlayClick(e) {
  if (e.target !== e.currentTarget) return;

  const closer = modalClosers.get(e.currentTarget);
  if (closer) {
    closer();
  } else {
    e.currentTarget.classList.add('hidden');
  }
}
