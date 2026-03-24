/**
 * 确认对话框模块
 * @module modules/app/confirm-dialog
 */

// 当前确认对话框的控制器
let currentConfirmController = null;

function getDialogElements(elements = null) {
  return elements || {
    confirmModal: document.getElementById('confirm-modal'),
    confirmCard: document.querySelector('#confirm-modal .confirm-card'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmIcon: document.getElementById('confirm-icon'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmOk: document.getElementById('confirm-ok'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmClose: document.getElementById('confirm-close')
  };
}

function resolveNativeConfirm(message, onConfirm, onCancel) {
  const result = confirm(message || '确认执行该操作？');
  if (result && onConfirm) onConfirm();
  if (!result && onCancel) onCancel();
  return result;
}

function openDialog(message, options = {}, onConfirm = null, onCancel = null, elements = null) {
  const {
    title = '确认操作',
    icon = '⚠️',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    danger = true,
    tone = danger ? 'danger' : 'info'
  } = options;

  return new Promise((resolve) => {
    try {
      const els = getDialogElements(elements);

      if (!els.confirmModal) {
        resolve(resolveNativeConfirm(message, onConfirm, onCancel));
        return;
      }

      if (currentConfirmController) {
        currentConfirmController.abort();
      }

      currentConfirmController = new AbortController();
      const signal = currentConfirmController.signal;

      els.confirmModal._currentResolve = resolve;
      els.confirmModal._currentOnConfirm = onConfirm;
      els.confirmModal._currentOnCancel = onCancel;
      els.confirmModal._currentShowCancel = showCancel;

      if (els.confirmTitle) els.confirmTitle.textContent = title;
      if (els.confirmIcon) els.confirmIcon.textContent = icon;
      if (els.confirmMessage) els.confirmMessage.textContent = message;
      if (els.confirmCard) els.confirmCard.dataset.tone = tone;
      if (els.confirmOk) {
        els.confirmOk.textContent = confirmText;
        els.confirmOk.classList.toggle('btn-danger', danger);
        els.confirmOk.classList.toggle('btn-primary', !danger);
      }
      if (els.confirmCancel) {
        els.confirmCancel.textContent = cancelText;
        els.confirmCancel.style.display = showCancel ? '' : 'none';
      }

      els.confirmModal.classList.add('show');

      const finish = (result) => {
        els.confirmModal.classList.remove('show');
        currentConfirmController = null;

        const currentResolve = els.confirmModal._currentResolve;
        const currentOnConfirm = els.confirmModal._currentOnConfirm;
        const currentOnCancel = els.confirmModal._currentOnCancel;

        delete els.confirmModal._currentResolve;
        delete els.confirmModal._currentOnConfirm;
        delete els.confirmModal._currentOnCancel;
        delete els.confirmModal._currentShowCancel;

        if (currentResolve) currentResolve(result);
        if (result && currentOnConfirm) currentOnConfirm();
        if (!result && currentOnCancel) currentOnCancel();
      };

      const handleConfirm = () => finish(true);
      const handleCancel = () => finish(false);
      const handleBackdrop = (event) => {
        if (event.target !== els.confirmModal) return;
        finish(showCancel ? false : true);
      };

      els.confirmOk?.addEventListener('click', handleConfirm, { signal });
      els.confirmCancel?.addEventListener('click', handleCancel, { signal });
      els.confirmClose?.addEventListener('click', handleCancel, { signal });
      els.confirmModal.addEventListener('click', handleBackdrop, { signal });
    } catch (err) {
      console.error('确认对话框初始化失败:', err);
      resolve(resolveNativeConfirm(message, onConfirm, onCancel));
    }
  });
}

/**
 * 显示确认对话框
 * @param {string} message - 确认消息
 * @param {Function} onConfirm - 确认回调
 * @param {Function} onCancel - 取消回调
 * @param {object} elements - DOM 元素引用
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, onConfirm = null, onCancel = null, elements = null) {
  return openDialog(message, {}, onConfirm, onCancel, elements);
}

export function showAlert(message, options = {}, onConfirm = null, elements = null) {
  return openDialog(message, {
    title: '操作完成',
    icon: '✅',
    confirmText: '我知道了',
    showCancel: false,
    danger: false,
    tone: 'success',
    ...options
  }, onConfirm, null, elements);
}

/**
 * 关闭当前确认对话框
 */
export function closeConfirm() {
  if (currentConfirmController) {
    currentConfirmController.abort();
    currentConfirmController = null;
  }
  const modal = document.getElementById('confirm-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// 导出默认对象
export default {
  showConfirm,
  showAlert,
  closeConfirm
};
