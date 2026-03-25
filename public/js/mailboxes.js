/**
 * 全局邮箱管理页面
 * @module mailboxes
 */

import { getCurrentUserKey } from './storage.js';
import { openForwardDialog, toggleFavorite, batchSetFavorite, injectDialogStyles } from './mailbox-settings.js';
import { api, loadMailboxes as fetchMailboxes, loadDomains as fetchDomains, deleteMailbox as apiDeleteMailbox, batchDeleteMailboxes, toggleLogin as apiToggleLogin, batchToggleLogin, resetPassword as apiResetPassword, changePassword as apiChangePassword } from './modules/mailboxes/api.js';
import { formatTime, escapeHtml, generateSkeleton, renderGrid, renderList } from './modules/mailboxes/render.js';

injectDialogStyles();

// showToast 由 toast-utils.js 全局提供
const showToast = window.showToast || ((msg, type) => console.log(`[${type}] ${msg}`));

// DOM 元素
const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  loadingPlaceholder: document.getElementById('loading-placeholder'),
  q: document.getElementById('q'),
  search: document.getElementById('search'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  page: document.getElementById('page'),
  logout: document.getElementById('logout'),
  viewGrid: document.getElementById('view-grid'),
  viewList: document.getElementById('view-list'),
  domainFilter: document.getElementById('domain-filter'),
  loginFilter: document.getElementById('login-filter'),
  favoriteFilter: document.getElementById('favorite-filter'),
  forwardFilter: document.getElementById('forward-filter'),
  selectPage: document.getElementById('select-page'),
  selectFiltered: document.getElementById('select-filtered'),
  deleteFiltered: document.getElementById('delete-filtered'),
  clearSelection: document.getElementById('clear-selection'),
  selectedCount: document.getElementById('selected-mailbox-count'),
  // 批量操作按钮
  batchAllow: document.getElementById('batch-allow'),
  batchDeny: document.getElementById('batch-deny'),
  batchFavorite: document.getElementById('batch-favorite'),
  batchUnfavorite: document.getElementById('batch-unfavorite'),
  batchForward: document.getElementById('batch-forward'),
  batchClearForward: document.getElementById('batch-clear-forward'),
  batchDelete: document.getElementById('batch-delete'),
  // 批量操作模态框
  batchModal: document.getElementById('batch-login-modal'),
  batchModalClose: document.getElementById('batch-modal-close'),
  batchModalIcon: document.getElementById('batch-modal-icon'),
  batchModalTitle: document.getElementById('batch-modal-title'),
  batchModalMessage: document.getElementById('batch-modal-message'),
  batchEmailsInput: document.getElementById('batch-emails-input'),
  batchCountInfo: document.getElementById('batch-count-info'),
  batchForwardWrapper: document.getElementById('batch-forward-input-wrapper'),
  batchForwardTarget: document.getElementById('batch-forward-target'),
  batchModalCancel: document.getElementById('batch-modal-cancel'),
  batchModalConfirm: document.getElementById('batch-modal-confirm'),
  // 通用确认弹窗
  confirmModal: document.getElementById('confirm-modal'),
  confirmIcon: document.getElementById('confirm-icon'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmOk: document.getElementById('confirm-ok'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmClose: document.getElementById('confirm-close'),
  // 密码操作模态框
  passwordModal: document.getElementById('password-modal'),
  passwordModalClose: document.getElementById('password-modal-close'),
  passwordModalIcon: document.getElementById('password-modal-icon'),
  passwordModalTitle: document.getElementById('password-modal-title'),
  passwordModalMessage: document.getElementById('password-modal-message'),
  passwordInputWrapper: document.getElementById('password-input-wrapper'),
  passwordNewInput: document.getElementById('password-new-input'),
  passwordShowToggle: document.getElementById('password-show-toggle'),
  passwordModalCancel: document.getElementById('password-modal-cancel'),
  passwordModalConfirm: document.getElementById('password-modal-confirm')
};

// 状态
let page = 1, PAGE_SIZE = 20, lastCount = 0, currentData = [];
let currentView = localStorage.getItem('mf:mailboxes:view') || 'grid';
let searchTimeout = null, isLoading = false;
let availableDomains = [];
const selectedAddresses = new Set();
let dialogResolver = null;
let dialogMode = 'confirm';

function closeConfirmModal(result = false) {
  if (els.confirmModal) {
    els.confirmModal.style.display = 'none';
  }
  const resolve = dialogResolver;
  dialogResolver = null;
  if (resolve) resolve(result);
}

function showDialog(message, options = {}) {
  const {
    title = '确认操作',
    icon = '⚠️',
    confirmText = '确定',
    cancelText = '取消',
    danger = true,
    showCancel = true,
    tone = danger ? 'danger' : 'info'
  } = options;

  return new Promise((resolve) => {
    dialogResolver = resolve;
    dialogMode = showCancel ? 'confirm' : 'alert';

    if (els.confirmTitle) els.confirmTitle.textContent = title;
    if (els.confirmIcon) els.confirmIcon.textContent = icon;
    if (els.confirmMessage) els.confirmMessage.textContent = message;
    if (els.confirmCancel) {
      els.confirmCancel.textContent = cancelText;
      els.confirmCancel.style.display = showCancel ? 'inline-flex' : 'none';
    }
    if (els.confirmOk) {
      els.confirmOk.textContent = confirmText;
      els.confirmOk.classList.toggle('btn-danger', danger);
      els.confirmOk.classList.toggle('btn-primary', !danger);
    }
    if (els.confirmModal) {
      const card = els.confirmModal.querySelector('.confirm-card');
      if (card) {
        card.dataset.tone = tone;
      }
      els.confirmModal.style.display = 'flex';
    } else {
      resolve(window.confirm(message));
    }
  });
}

function showConfirmDialog(message, options = {}) {
  return showDialog(message, { ...options, showCancel: true });
}

function showAlertDialog(message, options = {}) {
  return showDialog(message, { confirmText: '我知道了', danger: false, showCancel: false, tone: 'info', ...options });
}

function getCurrentFilterParams() {
  const params = {};
  if (els.q?.value) params.q = els.q.value.trim();
  if (els.domainFilter?.value) params.domain = els.domainFilter.value;
  if (els.loginFilter?.value) params.login = els.loginFilter.value;
  if (els.favoriteFilter?.value) params.favorite = els.favoriteFilter.value;
  if (els.forwardFilter?.value) params.forward = els.forwardFilter.value;
  return params;
}

async function loadAllFilteredAddresses() {
  const baseParams = getCurrentFilterParams();
  const size = 500;
  let currentPage = 1;
  let total = 0;
  const addresses = [];

  while (true) {
    const data = await fetchMailboxes({ ...baseParams, page: currentPage, size });
    const list = Array.isArray(data) ? data : (data.list || []);
    total = Number(data?.total ?? list.length);
    for (const item of list) {
      if (item?.address) addresses.push(item.address);
    }
    if (addresses.length >= total || list.length < size) break;
    currentPage += 1;
  }

  return Array.from(new Set(addresses));
}

function renderCurrentData() {
  if (!els.grid) return;
  els.grid.innerHTML = currentView === 'grid'
    ? renderGrid(currentData, { selectedAddresses })
    : renderList(currentData, { selectedAddresses });
}

function updateSelectionUI() {
  const count = selectedAddresses.size;
  if (els.selectedCount) {
    els.selectedCount.textContent = `已选 ${count} 项`;
  }
  if (els.batchDelete) {
    els.batchDelete.disabled = count === 0;
  }
  if (els.clearSelection) {
    els.clearSelection.disabled = count === 0;
  }
  if (els.selectFiltered) {
    els.selectFiltered.disabled = lastCount === 0;
  }
  if (els.deleteFiltered) {
    els.deleteFiltered.disabled = lastCount === 0;
  }
}

function blurActionButton(target) {
  if (target && typeof target.blur === 'function') {
    target.blur();
  }
}

async function readErrorMessage(response, fallback = '操作失败') {
  try {
    const payload = await response.clone().json();
    return payload?.error || payload?.message || fallback;
  } catch (_) {
    try {
      const text = await response.text();
      return text || fallback;
    } catch (_) {
      return fallback;
    }
  }
}

function summarizeDeleteResult(payload, requestedCount) {
  const deletedCount = Number(payload?.deleted_count ?? 0);
  const failed = Array.isArray(payload?.failed) ? payload.failed : [];
  const failedCount = Number(payload?.failed_count ?? failed.length ?? 0);
  const totalCount = Number(requestedCount ?? (deletedCount + failedCount) ?? 0);
  const failedPreview = failed
    .slice(0, 5)
    .map(item => {
      const address = String(item?.address || '').trim() || '未知地址';
      const reason = String(item?.error || '未知原因').trim();
      return `${address}: ${reason}`;
    });
  return { deletedCount, failedCount, totalCount, failedPreview };
}

function toggleSelectedAddress(address, forceSelected = null) {
  if (!address) return;
  if (forceSelected === true) {
    selectedAddresses.add(address);
  } else if (forceSelected === false) {
    selectedAddresses.delete(address);
  } else if (selectedAddresses.has(address)) {
    selectedAddresses.delete(address);
  } else {
    selectedAddresses.add(address);
  }
  updateSelectionUI();
}

// 加载邮箱列表
async function load() {
  if (isLoading) return;
  isLoading = true;
  
  // 显示骨架屏
  if (els.grid) els.grid.innerHTML = generateSkeleton(currentView, 8);
  if (els.empty) els.empty.style.display = 'none';
  
  try {
    const params = { page, size: PAGE_SIZE, ...getCurrentFilterParams() };
    
    const data = await fetchMailboxes(params);
    const list = Array.isArray(data) ? data : (data.list || []);
    const total = data.total ?? list.length;
    lastCount = total;
    currentData = list;
    
    if (!list.length) {
      els.grid.innerHTML = '';
      if (els.empty) els.empty.style.display = 'block';
    } else {
      renderCurrentData();
      if (els.empty) els.empty.style.display = 'none';
    }
    
    updatePager();
    updateSelectionUI();
    bindCardEvents();
  } catch (e) {
    console.error('加载失败:', e);
    showToast('加载失败', 'error');
  } finally {
    isLoading = false;
  }
}

// 更新分页器
function updatePager() {
  const totalPages = Math.max(1, Math.ceil(lastCount / PAGE_SIZE));
  if (els.page) els.page.textContent = `第 ${page} / ${totalPages} 页 (共 ${lastCount} 个)`;
  if (els.prev) els.prev.disabled = page <= 1;
  if (els.next) els.next.disabled = page >= totalPages;
}

// 绑定卡片事件
function bindCardEvents() {
  // 绑定卡片点击跳转（网格视图）
  els.grid?.querySelectorAll('.mailbox-card[data-action="jump"]').forEach(card => {
    card.onclick = (e) => {
      // 如果点击的是按钮区域，不跳转
      if (e.target.closest('.actions') || e.target.closest('.select-badge')) return;
      const address = card.dataset.address;
      if (address) {
        showToast('跳转中...', 'info', 500);
        setTimeout(() => location.href = `/?mailbox=${encodeURIComponent(address)}`, 600);
      }
    };
  });

  els.grid?.querySelectorAll('.mailbox-list-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.closest('.list-actions') || e.target.closest('.list-select')) return;
      const address = item.dataset.address;
      if (address) {
        showToast('跳转中...', 'info', 500);
        setTimeout(() => location.href = `/?mailbox=${encodeURIComponent(address)}`, 600);
      }
    };
  });

  els.grid?.querySelectorAll('.mailbox-select').forEach(input => {
    input.onchange = (e) => {
      e.stopPropagation();
      const card = input.closest('[data-address]');
      const address = card?.dataset.address;
      toggleSelectedAddress(address, input.checked);
      card?.classList.toggle('selected', input.checked);
    };
  });
  
  // 绑定按钮操作
  els.grid?.querySelectorAll('[data-action]').forEach(btn => {
    // 跳过卡片本身（只处理按钮）
    if (btn.classList.contains('mailbox-card') || btn.classList.contains('mailbox-list-item')) return;
    
    btn.onclick = async (e) => {
      e.stopPropagation();
      const card = btn.closest('[data-address]');
      const address = card?.dataset.address;
      const id = card?.dataset.id;
      const action = btn.dataset.action;
      
      if (!address) return;
      
      switch (action) {
        case 'select':
          break;
        case 'copy':
          try { await navigator.clipboard.writeText(address); showToast('已复制', 'success'); }
          catch(_) { showToast('复制失败', 'error'); }
          break;
        case 'jump':
          showToast('跳转中...', 'info', 500);
          setTimeout(() => location.href = `/?mailbox=${encodeURIComponent(address)}`, 600);
          break;
        case 'pin':
          try {
            const pinRes = await api(`/api/mailboxes/pin?address=${encodeURIComponent(address)}`, {
              method: 'POST'
            });
            if (pinRes.ok) {
              showToast('置顶状态已更新', 'success');
              load();
            } else {
              showToast('操作失败', 'error');
            }
          } catch(e) { showToast('操作失败', 'error'); }
          break;
        case 'forward':
          const m = currentData.find(x => x.address === address);
          if (m && m.id) openForwardDialog(m.id, m.address, m.forward_to);
          break;
        case 'favorite':
          const mb = currentData.find(x => x.address === address);
          if (mb && mb.id) { 
            const result = await toggleFavorite(mb.id); 
            if (result.success) load();
          }
          break;
        case 'login':
          const mailbox = currentData.find(x => x.address === address);
          if (mailbox) {
            try {
              await apiToggleLogin(address, !mailbox.can_login);
              showToast(mailbox.can_login ? '已禁止登录' : '已允许登录', 'success');
              load();
            } catch(e) { showToast('操作失败', 'error'); }
          }
          break;
        case 'password':
          const pwMailbox = currentData.find(x => x.address === address);
          if (pwMailbox) {
            openPasswordModal(address, pwMailbox.password_is_default);
          }
          break;
        case 'delete':
          if (!await showConfirmDialog(
            `确定删除邮箱 ${address}？\n删除后该邮箱及其邮件会被硬删除，且不可恢复。`,
            { title: '删除邮箱', icon: '🗑️' }
          )) return;
          try {
            const response = await apiDeleteMailbox(address);
            if (!response.ok) {
              throw new Error(await readErrorMessage(response, '删除失败'));
            }
            await load();
            await showAlertDialog(
              `已完成硬删除邮箱 ${address}。\n相关邮件与关联数据也已一并清理。`,
              { title: '删除完成', icon: '✅', confirmText: '继续管理', tone: 'success' }
            );
          } catch(e) { showToast(e.message || '删除失败', 'error'); }
          break;
      }
    };
  });
}

// 视图切换
function switchView(view) {
  if (currentView === view) return;
  currentView = view;
  localStorage.setItem('mf:mailboxes:view', view);
  els.viewGrid?.classList.toggle('active', view === 'grid');
  els.viewList?.classList.toggle('active', view === 'list');
  els.grid.className = view;
  if (currentData.length) {
    renderCurrentData();
    bindCardEvents();
  }
}

// 加载域名筛选
async function loadDomainsFilter() {
  try {
    const domains = await fetchDomains();
    if (Array.isArray(domains) && domains.length) {
      availableDomains = domains.sort();
      if (els.domainFilter) {
        els.domainFilter.innerHTML = '<option value="">全部域名</option>' + domains.map(d => `<option value="${d}">@${d}</option>`).join('');
      }
    }
  } catch(_) {}
}

// 批量操作状态
let currentBatchAction = null;

// 密码操作状态
let currentPasswordAddress = null;
let currentPasswordIsDefault = false;

// 打开密码操作模态框
function openPasswordModal(address, isDefault) {
  currentPasswordAddress = address;
  currentPasswordIsDefault = isDefault;
  
  if (isDefault) {
    // 设置新密码
    if (els.passwordModalIcon) els.passwordModalIcon.textContent = '🔐';
    if (els.passwordModalTitle) els.passwordModalTitle.textContent = '设置密码';
    if (els.passwordModalMessage) els.passwordModalMessage.innerHTML = `为 <strong>${address}</strong> 设置新密码：`;
    if (els.passwordInputWrapper) els.passwordInputWrapper.style.display = 'block';
    if (els.passwordNewInput) els.passwordNewInput.value = '';
    if (els.passwordShowToggle) els.passwordShowToggle.checked = false;
    if (els.passwordNewInput) els.passwordNewInput.type = 'password';
  } else {
    // 重置密码
    if (els.passwordModalIcon) els.passwordModalIcon.textContent = '🔓';
    if (els.passwordModalTitle) els.passwordModalTitle.textContent = '重置密码';
    if (els.passwordModalMessage) els.passwordModalMessage.innerHTML = `确定将 <strong>${address}</strong> 的密码重置为默认密码（邮箱地址）？`;
    if (els.passwordInputWrapper) els.passwordInputWrapper.style.display = 'none';
  }
  
  if (els.passwordModal) els.passwordModal.style.display = 'flex';
  if (isDefault && els.passwordNewInput) {
    setTimeout(() => els.passwordNewInput.focus(), 100);
  }
}

// 关闭密码操作模态框
function closePasswordModal() {
  if (els.passwordModal) els.passwordModal.style.display = 'none';
  currentPasswordAddress = null;
  currentPasswordIsDefault = false;
}

// 执行密码操作
async function executePasswordAction() {
  if (!currentPasswordAddress) return;
  
  const btnText = els.passwordModalConfirm?.querySelector('.password-btn-text');
  const btnLoading = els.passwordModalConfirm?.querySelector('.password-btn-loading');
  if (btnText) btnText.style.display = 'none';
  if (btnLoading) btnLoading.style.display = 'inline';
  if (els.passwordModalConfirm) els.passwordModalConfirm.disabled = true;
  
  try {
    let res;
    if (currentPasswordIsDefault) {
      // 设置新密码
      const newPwd = els.passwordNewInput?.value?.trim();
      if (!newPwd) {
        showToast('请输入新密码', 'error');
        return;
      }
      res = await apiChangePassword(currentPasswordAddress, newPwd);
    } else {
      // 重置密码
      res = await apiResetPassword(currentPasswordAddress);
    }
    
    if (res.ok) {
      showToast(currentPasswordIsDefault ? '密码已设置' : '密码已重置', 'success');
      closePasswordModal();
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '操作失败', 'error');
    }
  } catch (e) {
    showToast('操作失败: ' + (e.message || '未知错误'), 'error');
  } finally {
    if (btnText) btnText.style.display = 'inline';
    if (btnLoading) btnLoading.style.display = 'none';
    if (els.passwordModalConfirm) els.passwordModalConfirm.disabled = false;
  }
}

// 打开批量操作模态框
function openBatchModal(action, title, icon, message) {
  currentBatchAction = action;
  if (els.batchModalIcon) els.batchModalIcon.textContent = icon;
  if (els.batchModalTitle) els.batchModalTitle.textContent = title;
  if (els.batchModalMessage) els.batchModalMessage.textContent = message;
  if (els.batchEmailsInput) els.batchEmailsInput.value = '';
  if (els.batchCountInfo) els.batchCountInfo.textContent = '输入邮箱后将显示数量统计';
  if (els.batchModalConfirm) els.batchModalConfirm.disabled = true;
  
  // 显示/隐藏转发目标输入
  if (els.batchForwardWrapper) {
    els.batchForwardWrapper.style.display = action === 'forward' ? 'block' : 'none';
  }
  if (els.batchForwardTarget) els.batchForwardTarget.value = '';
  
  if (els.batchModal) els.batchModal.style.display = 'flex';
}

// 关闭批量操作模态框
function closeBatchModal() {
  if (els.batchModal) els.batchModal.style.display = 'none';
  currentBatchAction = null;
}

// 解析邮箱列表
function parseEmails(text) {
  if (!text) return [];
  return text.split(/[\n,;，；\s]+/).map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
}

// 更新邮箱计数
function updateBatchCount() {
  const emails = parseEmails(els.batchEmailsInput?.value || '');
  if (els.batchCountInfo) {
    els.batchCountInfo.textContent = emails.length > 0 ? `已识别 ${emails.length} 个邮箱地址` : '输入邮箱后将显示数量统计';
  }
  if (els.batchModalConfirm) {
    const forwardValid = currentBatchAction !== 'forward' || (els.batchForwardTarget?.value?.includes('@'));
    els.batchModalConfirm.disabled = emails.length === 0 || !forwardValid;
  }
}

// 执行批量操作
async function executeBatchAction() {
  const emails = parseEmails(els.batchEmailsInput?.value || '');
  if (!emails.length) return;
  
  const btnText = els.batchModalConfirm?.querySelector('.batch-btn-text');
  const btnLoading = els.batchModalConfirm?.querySelector('.batch-btn-loading');
  if (btnText) btnText.style.display = 'none';
  if (btnLoading) btnLoading.style.display = 'inline';
  if (els.batchModalConfirm) els.batchModalConfirm.disabled = true;
  
  try {
    let result;
    switch (currentBatchAction) {
      case 'allow':
        result = await batchToggleLogin(emails, true);
        break;
      case 'deny':
        result = await batchToggleLogin(emails, false);
        break;
      case 'favorite':
        result = await api('/api/mailboxes/batch-favorite-by-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: emails, is_favorite: true })
        });
        break;
      case 'unfavorite':
        result = await api('/api/mailboxes/batch-favorite-by-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: emails, is_favorite: false })
        });
        break;
      case 'forward':
        const forwardTo = els.batchForwardTarget?.value?.trim();
        if (!forwardTo) { showToast('请输入转发目标', 'error'); return; }
        result = await api('/api/mailboxes/batch-forward-by-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: emails, forward_to: forwardTo })
        });
        break;
      case 'clear-forward':
        result = await api('/api/mailboxes/batch-forward-by-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: emails, forward_to: null })
        });
        break;
      case 'delete':
        result = await batchDeleteMailboxes(emails);
        break;
    }
    if (!result?.ok) {
      throw new Error(await readErrorMessage(result, '批量操作失败'));
    }
    const payload = await result.json().catch(() => ({}));
    const deletedCount = payload.deleted_count ?? emails.length;
    closeBatchModal();
    if (currentBatchAction === 'delete') {
      const { failedCount, failedPreview, totalCount } = summarizeDeleteResult(payload, emails.length);
      await showAlertDialog(
        failedCount > 0
          ? `请求删除 ${totalCount} 个邮箱，实际删除 ${deletedCount} 个，失败 ${failedCount} 个。`
            + (failedPreview.length ? `\n失败示例：\n${failedPreview.join('\n')}` : '')
          : `已完成硬删除 ${deletedCount} 个邮箱。\n相关邮件与关联数据也已一并清理。`,
        { title: '批量删除完成', icon: '✅', confirmText: '继续管理', tone: 'success' }
      );
    } else {
      showToast('批量操作完成', 'success');
    }
    load();
  } catch (e) {
    showToast('操作失败: ' + (e.message || '未知错误'), 'error');
  } finally {
    if (btnText) btnText.style.display = 'inline';
    if (btnLoading) btnLoading.style.display = 'none';
    if (els.batchModalConfirm) els.batchModalConfirm.disabled = false;
  }
}

async function deleteSelectedMailboxes(event) {
  const allSelected = Array.from(selectedAddresses);
  if (!allSelected.length) {
    showToast('请先勾选邮箱', 'error');
    blurActionButton(event?.currentTarget);
    return;
  }

  let filteredAddresses = [];
  try {
    filteredAddresses = await loadAllFilteredAddresses();
  } catch (e) {
    showToast('读取当前筛选结果失败', 'error');
    blurActionButton(event?.currentTarget);
    return;
  }

  const filteredSet = new Set(filteredAddresses);
  const addresses = allSelected.filter(address => filteredSet.has(address));
  if (!addresses.length) {
    showToast('当前筛选结果中没有已选邮箱', 'error');
    blurActionButton(event?.currentTarget);
    return;
  }

  const prompt = `当前筛选结果共 ${filteredAddresses.length} 项，将删除其中已选的 ${addresses.length} 项。删除后邮箱及其邮件会被硬删除，是否继续？`;
  if (!await showConfirmDialog(prompt, {
    title: '删除所选邮箱',
    icon: '🗑️',
    confirmText: `删除 ${addresses.length} 项`
  })) {
    blurActionButton(event?.currentTarget);
    return;
  }

  try {
    const result = await batchDeleteMailboxes(addresses);
    if (!result.ok) {
      throw new Error(await readErrorMessage(result, '删除失败'));
    }
    const payload = await result.json().catch(() => ({}));
    for (const address of payload.deleted || addresses) {
      selectedAddresses.delete(address);
    }
    updateSelectionUI();
    const { deletedCount, failedCount, failedPreview } = summarizeDeleteResult(payload, addresses.length);
    const skippedCount = Math.max(allSelected.length - addresses.length, 0);
    await load();
    await showAlertDialog(
      failedCount > 0
        ? `请求删除 ${addresses.length} 个已选邮箱，实际删除 ${deletedCount} 个，失败 ${failedCount} 个。`
          + (skippedCount > 0 ? `\n另有 ${skippedCount} 个已选邮箱不在当前筛选范围内，未参与本次删除。` : '')
          + (failedPreview.length ? `\n失败示例：\n${failedPreview.join('\n')}` : '')
        : skippedCount > 0
        ? `已完成硬删除 ${deletedCount} 个邮箱。\n本次仅处理当前筛选结果中的已选项，另有 ${skippedCount} 个已选邮箱不在当前筛选范围内，未被删除。`
        : `已完成硬删除 ${deletedCount} 个邮箱。\n相关邮件与关联数据也已一并清理。`,
      { title: '删除完成', icon: '✅', confirmText: '继续管理', tone: 'success' }
    );
  } catch (e) {
    showToast('删除失败: ' + (e.message || '未知错误'), 'error');
  } finally {
    blurActionButton(event?.currentTarget);
  }
}

async function deleteFilteredMailboxes(event) {
  let addresses = [];
  try {
    addresses = await loadAllFilteredAddresses();
  } catch (e) {
    showToast('读取当前筛选结果失败', 'error');
    blurActionButton(event?.currentTarget);
    return;
  }

  if (!addresses.length) {
    showToast('当前筛选结果为空', 'error');
    blurActionButton(event?.currentTarget);
    return;
  }

  const label = getCurrentFilterParams();
  const hasFilter = Object.keys(label).length > 0;
  const prompt = hasFilter
    ? `当前筛选结果共 ${addresses.length} 项，将全部硬删除。相关邮件与关联数据也会一起清理，是否继续？`
    : `将删除系统中的全部 ${addresses.length} 个邮箱。相关邮件与关联数据也会一起清理，是否继续？`;

  if (!await showConfirmDialog(prompt, {
    title: hasFilter ? '删除筛选结果' : '删除全部邮箱',
    icon: '🗑️',
    confirmText: hasFilter ? `删除 ${addresses.length} 项` : `删除全部 ${addresses.length} 项`
  })) {
    blurActionButton(event?.currentTarget);
    return;
  }

  try {
    const result = await batchDeleteMailboxes(addresses);
    if (!result.ok) {
      throw new Error(await readErrorMessage(result, '删除失败'));
    }
    const payload = await result.json().catch(() => ({}));
    const { deletedCount, failedCount, failedPreview } = summarizeDeleteResult(payload, addresses.length);
    selectedAddresses.clear();
    updateSelectionUI();
    await load();
    await showAlertDialog(
      failedCount > 0
        ? `请求删除 ${addresses.length} 个邮箱，实际删除 ${deletedCount} 个，失败 ${failedCount} 个。`
          + (failedPreview.length ? `\n失败示例：\n${failedPreview.join('\n')}` : '')
        : `已完成硬删除 ${deletedCount} 个邮箱。\n相关邮件与关联数据也已一并清理。`,
      { title: hasFilter ? '筛选结果删除完成' : '全部删除完成', icon: '✅', confirmText: '继续管理', tone: 'success' }
    );
  } catch (e) {
    showToast('删除失败: ' + (e.message || '未知错误'), 'error');
  } finally {
    blurActionButton(event?.currentTarget);
  }
}

function selectCurrentPageMailboxes(event) {
  currentData.forEach(item => selectedAddresses.add(item.address));
  renderCurrentData();
  bindCardEvents();
  updateSelectionUI();
  blurActionButton(event?.currentTarget);
}

async function selectFilteredMailboxes(event) {
  try {
    const button = event?.currentTarget;
    if (button) button.disabled = true;
    const addresses = await loadAllFilteredAddresses();
    addresses.forEach(address => selectedAddresses.add(address));
    renderCurrentData();
    bindCardEvents();
    updateSelectionUI();
    showToast(`已选中当前筛选结果 ${addresses.length} 项`, 'success');
    blurActionButton(button);
  } catch (e) {
    showToast('全选筛选结果失败', 'error');
  } finally {
    if (els.selectFiltered) {
      els.selectFiltered.disabled = lastCount === 0;
    }
  }
}

function clearSelectedMailboxes(event) {
  selectedAddresses.clear();
  renderCurrentData();
  bindCardEvents();
  updateSelectionUI();
  blurActionButton(event?.currentTarget);
}

// 事件绑定
els.search?.addEventListener('click', () => { page = 1; load(); });
els.q?.addEventListener('input', () => { if (searchTimeout) clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { page = 1; load(); }, 300); });
els.q?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); page = 1; load(); }});
els.prev?.addEventListener('click', () => { if (page > 1 && !isLoading) { page--; load(); }});
els.next?.addEventListener('click', () => { 
  const totalPages = Math.max(1, Math.ceil(lastCount / PAGE_SIZE));
  if (page < totalPages && !isLoading) { page++; load(); }
});
els.domainFilter?.addEventListener('change', () => { page = 1; load(); });
els.loginFilter?.addEventListener('change', () => { page = 1; load(); });
els.favoriteFilter?.addEventListener('change', () => { page = 1; load(); });
els.forwardFilter?.addEventListener('change', () => { page = 1; load(); });
els.viewGrid?.addEventListener('click', () => switchView('grid'));
els.viewList?.addEventListener('click', () => switchView('list'));
els.logout?.addEventListener('click', async () => { try { await fetch('/api/logout', { method: 'POST' }); } catch(_) {} location.replace('/html/login.html'); });
els.selectPage?.addEventListener('click', selectCurrentPageMailboxes);
els.selectFiltered?.addEventListener('click', selectFilteredMailboxes);
els.deleteFiltered?.addEventListener('click', deleteFilteredMailboxes);
els.clearSelection?.addEventListener('click', clearSelectedMailboxes);

// 批量操作按钮
els.batchAllow?.addEventListener('click', () => openBatchModal('allow', '批量放行登录', '✅', '输入要允许登录的邮箱地址（每行一个或用逗号分隔）：'));
els.batchDeny?.addEventListener('click', () => openBatchModal('deny', '批量禁止登录', '🚫', '输入要禁止登录的邮箱地址（每行一个或用逗号分隔）：'));
els.batchFavorite?.addEventListener('click', () => openBatchModal('favorite', '批量收藏', '⭐', '输入要收藏的邮箱地址（每行一个或用逗号分隔）：'));
els.batchUnfavorite?.addEventListener('click', () => openBatchModal('unfavorite', '批量取消收藏', '☆', '输入要取消收藏的邮箱地址（每行一个或用逗号分隔）：'));
els.batchForward?.addEventListener('click', () => openBatchModal('forward', '批量设置转发', '↪️', '输入要设置转发的邮箱地址（每行一个或用逗号分隔）：'));
els.batchClearForward?.addEventListener('click', () => openBatchModal('clear-forward', '批量清除转发', '🚫', '输入要清除转发的邮箱地址（每行一个或用逗号分隔）：'));
els.batchDelete?.addEventListener('click', deleteSelectedMailboxes);

// 批量操作模态框事件
els.batchModalClose?.addEventListener('click', closeBatchModal);
els.batchModalCancel?.addEventListener('click', closeBatchModal);
els.batchEmailsInput?.addEventListener('input', updateBatchCount);
els.batchForwardTarget?.addEventListener('input', updateBatchCount);
els.batchModalConfirm?.addEventListener('click', executeBatchAction);
els.batchModal?.addEventListener('click', (e) => { if (e.target === els.batchModal) closeBatchModal(); });

// 通用确认弹窗事件
els.confirmOk?.addEventListener('click', () => closeConfirmModal(true));
els.confirmCancel?.addEventListener('click', () => closeConfirmModal(false));
els.confirmClose?.addEventListener('click', () => closeConfirmModal(false));
els.confirmModal?.addEventListener('click', (e) => {
  if (e.target === els.confirmModal) {
    closeConfirmModal(dialogMode === 'alert');
  }
});

// 密码操作模态框事件
els.passwordModalClose?.addEventListener('click', closePasswordModal);
els.passwordModalCancel?.addEventListener('click', closePasswordModal);
els.passwordModalConfirm?.addEventListener('click', executePasswordAction);
els.passwordModal?.addEventListener('click', (e) => { if (e.target === els.passwordModal) closePasswordModal(); });
els.passwordShowToggle?.addEventListener('change', () => {
  if (els.passwordNewInput) {
    els.passwordNewInput.type = els.passwordShowToggle.checked ? 'text' : 'password';
  }
});
els.passwordNewInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    executePasswordAction();
  }
});

// 初始化 guest 模式
async function initGuestMode() {
  // 初始化全局变量
  if (typeof window.__GUEST_MODE__ === 'undefined') {
    window.__GUEST_MODE__ = false;
  }
  
  try {
    const sessionResp = await fetch('/api/session');
    if (sessionResp.ok) {
      const session = await sessionResp.json();
      if (session.role === 'guest' || session.username === 'guest') {
        window.__GUEST_MODE__ = true;
        // 初始化 mock 数据
        const { MOCK_STATE, buildMockMailboxes } = await import('./modules/app/mock-api.js');
        if (!MOCK_STATE.mailboxes.length) {
          MOCK_STATE.mailboxes = buildMockMailboxes(6, 2, MOCK_STATE.domains);
        }
      }
    }
  } catch(e) {
    console.warn('Session check failed:', e);
  }
}

// 初始化
(async () => {
  // 先检查 guest 模式
  await initGuestMode();
  
  // 设置初始视图模式
  els.viewGrid?.classList.toggle('active', currentView === 'grid');
  els.viewList?.classList.toggle('active', currentView === 'list');
  if (els.grid) els.grid.className = currentView;
  
  await loadDomainsFilter();
  updateSelectionUI();
  await load();
})();
