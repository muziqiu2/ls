// ==========================================
// 标签页切换 + 触摸/鼠标滑动
// ==========================================
import { el, state } from './state.js';

// 卡片偏移百分比（每张卡片占轨道 1/3）
const SWIPE_CARD_PERCENT = 100 / 3;

// 滑动状态
let startX = 0;
let startY = 0;
let isSwipeActive = false;      // 是否已确认为水平滑动
let swipeDirectionLocked = null; // 'horizontal' | 'vertical' | null
let swipeStartTimestamp = 0;

/**
 * 初始化滑动事件：绑定标签按钮点击、触摸事件、鼠标事件和窗口 resize 校正
 */
export function initSwipeEvents() {
  // 绑定所有带 data-index 的元素（顶部标签 + 空状态"添加第一条记录"按钮）
  document.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(parseInt(btn.dataset.index));
    });
  });

  // 触摸事件 - 移动端滑动
  el.swipeContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
  el.swipeContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
  el.swipeContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
  el.swipeContainer.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // 鼠标事件 - 桌面端测试
  el.swipeContainer.addEventListener('mousedown', handleMouseDown);
  el.swipeContainer.addEventListener('mousemove', handleMouseMove);
  el.swipeContainer.addEventListener('mouseup', handleMouseUp);
  el.swipeContainer.addEventListener('mouseleave', handleMouseUp);

  // 窗口尺寸变化时校正位置，防止错位
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      el.swipeWrapper.style.transition = 'none';
      el.swipeWrapper.style.transform = `translateX(-${state.currentTabIndex * SWIPE_CARD_PERCENT}%)`;
      void el.swipeWrapper.offsetWidth; // 触发回流
      el.swipeWrapper.style.transition = '';
    }, 150);
  });
}

function handleTouchStart(e) {
  if (e.touches.length !== 1) {
    isSwipeActive = false;
    swipeDirectionLocked = null;
    startX = 0;
    startY = 0;
    return;
  }

  // 在可交互控件上按下不启动横滑，避免手指轻微横向位移把按钮点击误判成滑动、
  // 进而吞掉点击导致“点补充按钮没反应”
  if (e.target.closest('button, input, select, textarea, a')) {
    isSwipeActive = false;
    swipeDirectionLocked = 'vertical';
    startX = 0;
    startY = 0;
    return;
  }

  const touch = e.touches[0];
  startX = touch.clientX;
  startY = touch.clientY;
  swipeStartTimestamp = Date.now();
  isSwipeActive = false;
  swipeDirectionLocked = null;

  el.swipeWrapper.classList.add('is-dragging');
}

function handleTouchMove(e) {
  if (!startX || e.touches.length !== 1) return;

  const touch = e.touches[0];
  const diffX = touch.clientX - startX; // 正值 = 向右拖动
  const diffY = touch.clientY - startY;
  const absX = Math.abs(diffX);
  const absY = Math.abs(diffY);

  // 方向尚未锁定时判断
  if (!swipeDirectionLocked) {
    if (absX > 10 || absY > 10) {
      if (absX > absY * 1.2) {
        swipeDirectionLocked = 'horizontal';
        isSwipeActive = true;
      } else {
        swipeDirectionLocked = 'vertical';
        el.swipeWrapper.classList.remove('is-dragging');
        return;
      }
    } else {
      return; // 位移太小，继续观察
    }
  }

  if (swipeDirectionLocked === 'vertical') return;

  if (swipeDirectionLocked === 'horizontal') {
    const containerWidth = el.swipeContainer.offsetWidth;
    let dragOffset = (diffX / containerWidth) * SWIPE_CARD_PERCENT;
    const baseOffset = -state.currentTabIndex * SWIPE_CARD_PERCENT;

    // 边界阻尼（第一张不能左滑，最后一张不能右滑）
    const maxIndex = el.swipeCards.length - 1;
    if (state.currentTabIndex === 0 && diffX > 0) dragOffset *= 0.3;
    else if (state.currentTabIndex === maxIndex && diffX < 0) dragOffset *= 0.3;

    el.swipeWrapper.style.transform = `translateX(${baseOffset + dragOffset}%)`;

    // 确认为水平滑动后才阻止默认行为，保留垂直滚动
    if (e.cancelable) e.preventDefault();
  }
}

function handleTouchEnd(e) {
  if (!isSwipeActive || swipeDirectionLocked !== 'horizontal') {
    el.swipeWrapper.classList.remove('is-dragging');
    isSwipeActive = false;
    swipeDirectionLocked = null;
    startX = 0;
    startY = 0;
    return;
  }

  const touch = e.changedTouches[0];
  const diffX = touch.clientX - startX; // 负值 = 向左滑（下一页）
  const containerWidth = el.swipeContainer.offsetWidth;
  const elapsed = Date.now() - swipeStartTimestamp;
  const velocity = Math.abs(diffX) / elapsed; // px/ms

  // 判定切换：位移 > 容器宽度 18% 或快速甩动（速度 > 0.4px/ms）
  const threshold = Math.min(containerWidth * 0.18, 120);
  let targetIndex = state.currentTabIndex;

  if (diffX < -threshold || (diffX < -30 && velocity > 0.4)) {
    targetIndex = Math.min(state.currentTabIndex + 1, el.swipeCards.length - 1);
  } else if (diffX > threshold || (diffX > 30 && velocity > 0.4)) {
    targetIndex = Math.max(state.currentTabIndex - 1, 0);
  }

  el.swipeWrapper.classList.remove('is-dragging');
  switchTab(targetIndex);

  isSwipeActive = false;
  swipeDirectionLocked = null;
  startX = 0;
  startY = 0;
}

function handleMouseDown(e) {
  // 在可交互控件上不启动横滑，避免把按钮点击误判成滑动（同触摸逻辑）
  if (e.target.closest('button, input, select, textarea, a')) {
    isSwipeActive = false;
    swipeDirectionLocked = null;
    startX = 0;
    startY = 0;
    return;
  }
  startX = e.clientX;
  startY = e.clientY;
  swipeStartTimestamp = Date.now();
  isSwipeActive = false;
  swipeDirectionLocked = 'horizontal'; // 桌面端默认水平滑动
  el.swipeWrapper.classList.add('is-dragging');
  el.swipeContainer.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
  if (!startX || swipeDirectionLocked !== 'horizontal') return;

  const diffX = e.clientX - startX;
  if (Math.abs(diffX) < 5) return;

  isSwipeActive = true;
  const containerWidth = el.swipeContainer.offsetWidth;
  let dragOffset = (diffX / containerWidth) * SWIPE_CARD_PERCENT;
  const baseOffset = -state.currentTabIndex * SWIPE_CARD_PERCENT;

  const maxIndex = el.swipeCards.length - 1;
  if (state.currentTabIndex === 0 && diffX > 0) dragOffset *= 0.3;
  else if (state.currentTabIndex === maxIndex && diffX < 0) dragOffset *= 0.3;

  el.swipeWrapper.style.transform = `translateX(${baseOffset + dragOffset}%)`;
  if (e.preventDefault) e.preventDefault();
}

function handleMouseUp(e) {
  el.swipeContainer.style.cursor = 'grab';

  if (!isSwipeActive) {
    el.swipeWrapper.classList.remove('is-dragging');
    isSwipeActive = false;
    swipeDirectionLocked = null;
    startX = 0;
    startY = 0;
    return;
  }

  const diffX = e.clientX - startX;
  const containerWidth = el.swipeContainer.offsetWidth;
  const threshold = Math.min(containerWidth * 0.2, 120);
  let targetIndex = state.currentTabIndex;

  if (diffX < -threshold) targetIndex = Math.min(state.currentTabIndex + 1, el.swipeCards.length - 1);
  else if (diffX > threshold) targetIndex = Math.max(state.currentTabIndex - 1, 0);

  el.swipeWrapper.classList.remove('is-dragging');
  switchTab(targetIndex);

  isSwipeActive = false;
  swipeDirectionLocked = null;
  startX = 0;
  startY = 0;
}

/**
 * 切换标签页
 * @param {number} index 目标标签页索引
 */
export function switchTab(index) {
  if (index < 0 || index >= el.swipeCards.length) return;

  state.currentTabIndex = index;

  el.swipeWrapper.classList.remove('is-dragging');
  el.swipeWrapper.classList.add('snap-back');
  el.swipeWrapper.style.transform = `translateX(-${index * SWIPE_CARD_PERCENT}%)`;

  setTimeout(() => {
    el.swipeWrapper.classList.remove('snap-back');
  }, 400);

  // 更新顶部标签按钮样式与指示器
  el.tabBtns.forEach((btn, i) => {
    const indicator = btn.querySelector('.tab-indicator');
    indicator.classList.remove('bg-primary', 'bg-secondary', 'bg-accent');

    if (i === index) {
      btn.classList.remove('text-gray-500');
      indicator.classList.add('w-full');
      if (i === 0) indicator.classList.add('bg-primary');
      else if (i === 1) indicator.classList.add('bg-secondary');
      else if (i === 2) indicator.classList.add('bg-accent');
    } else {
      btn.classList.add('text-gray-500');
      indicator.classList.remove('w-full');
    }
  });

  // 底部导航激活态
  document.querySelectorAll('.bn-btn, .bn-log').forEach(btn => {
    btn.classList.toggle('bn-active', parseInt(btn.dataset.index, 10) === index);
  });
}