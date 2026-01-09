let currentAuth = null;
let currentFakeid = null;
let currentQuery = '';
let currentPage = 0;
let totalAccounts = 0;
let currentArticlePage = 0;
let totalArticles = 0;
let currentArticlesList = [];
let loginTabId = null;
let sogouSearchPage = 0;
let sogouSearchQuery = '';
let sogouTotalPages = 0;
let accountConfigs = {}; // 多账号配置 { fakeid: { name, key, pass_ticket, enableCache } }
let globalUin = ''; // 通用 uin 参数
let enhancedArticlesList = []; // 增强模式文章列表（带阅读量）
let enableEnhancedMode = false; // 是否启用增强模式
let isLoadingStats = false; // 是否正在加载阅读量
let currentLoadingId = 0; // 当前加载ID，用于防止竞态条件
const CACHE_EXPIRE_DAYS = 15; // 缓存过期天数
let rateLimitedFakeid = null; // 被限流的账号 fakeid
let rateLimitedQueue = []; // 限流时剩余未获取的文章队列
let rateLimitedLoadingId = null; // 限流时的 loadingId
let rateLimitedAllArticles = null; // 限流时的全部文章列表

// ============= 智能增量更新相关函数 =============

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 检查今日是否已更新
async function isUpdatedToday(fakeid) {
  const data = await chrome.storage.local.get(['dailyUpdateRecord']);
  const record = data.dailyUpdateRecord?.[fakeid];
  return record?.lastUpdateDate === getTodayDate();
}

// 记录今日已更新
async function markUpdatedToday(fakeid) {
  const data = await chrome.storage.local.get(['dailyUpdateRecord']);
  const records = data.dailyUpdateRecord || {};
  records[fakeid] = {
    lastUpdateDate: getTodayDate(),
    lastUpdateTime: Date.now()
  };
  await chrome.storage.local.set({ dailyUpdateRecord: records });
}

// 相对时间格式化
function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  const minutes = Math.floor(diff / (1000 * 60));
  return minutes > 0 ? `${minutes}分钟前` : '刚刚';
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();

  // 如果已登录但没有用户信息，立即获取
  if (currentAuth.token && currentAuth.cookie && !currentAuth.userInfo) {
    fetchUserInfo().then(() => checkAuthStatus());
  }

  document.getElementById('extractZhihuBtn').addEventListener('click', extractZhihu);
  document.getElementById('copyAllArticlesBtn').addEventListener('click', copyAllArticles);
  document.getElementById('copyAllZhihuBtn').addEventListener('click', copyAllZhihu);
  document.getElementById('deleteAllArticlesBtn').addEventListener('click', deleteAllArticles);
  document.getElementById('deleteAllZhihuBtn').addEventListener('click', deleteAllZhihu);
  document.getElementById('searchBtn').addEventListener('click', () => { saveSearchHistory(); searchAccount(0); });
  document.getElementById('searchArticleBtn').addEventListener('click', () => { saveSearchHistory(); searchSogouArticle(0); });
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { saveSearchHistory(); searchAccount(0); }
  });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    document.getElementById('clearBtn').style.display = e.target.value ? 'block' : 'none';
  });
  document.getElementById('searchInput').addEventListener('focus', showSearchHistory);
  document.getElementById('searchInput').addEventListener('blur', () => {
    setTimeout(() => document.getElementById('searchHistory').style.display = 'none', 200);
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearBtn').style.display = 'none';
    document.getElementById('results').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
  });
  document.getElementById('backBtn').addEventListener('click', showSearchView);
  document.getElementById('refreshArticlesBtn').addEventListener('click', refreshArticles);
  document.getElementById('exportCurrentBtn').addEventListener('click', exportCurrentArticles);
  document.getElementById('exportAllBtn').addEventListener('click', exportAllArticles);
  document.getElementById('prevBtn').addEventListener('click', () => searchAccount(currentPage - 1));
  document.getElementById('nextBtn').addEventListener('click', () => searchAccount(currentPage + 1));
  document.getElementById('prevArticleBtn').addEventListener('click', () => loadArticles(currentFakeid, currentArticlePage - 1));
  document.getElementById('nextArticleBtn').addEventListener('click', () => loadArticles(currentFakeid, currentArticlePage + 1));
  document.getElementById('articleCacheToggle').addEventListener('change', toggleArticleCache);

  // 设置按钮事件
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveWxClientSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('sortBy').addEventListener('change', sortArticles);

  // 模态框点击外部关闭
  const settingsModal = document.getElementById('settingsModal');
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
  settingsModal.addEventListener('dblclick', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // 导出路径设置事件
  document.getElementById('selectExportPathBtn').addEventListener('click', selectExportPath);
  document.getElementById('clearExportPathBtn').addEventListener('click', clearExportPath);
  document.getElementById('exportPathDisplay').addEventListener('click', selectExportPath);

  // 初始化导出路径显示
  loadExportPathDisplay();

  // 加载抓包参数
  loadWxClientSettings();

  // 标签页切换
  document.querySelectorAll('.tab-mini').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-mini').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  loadWxArticles();
  loadZhihuArticles();
  renderHomeCachedAccountsList();

  // 首页刷新缓存按钮
  document.getElementById('refreshCachedBtn').addEventListener('click', renderHomeCachedAccountsList);

  // 监听 storage 变化自动刷新列表
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.articles) loadWxArticles();
      if (changes.zhihuArticles) loadZhihuArticles();
      if (changes.articleCache || changes.accountConfigs || changes.dailyUpdateRecord) renderHomeCachedAccountsList();
      // 检测登录成功，关闭登录标签页
      if (changes.token && changes.token.newValue && loginTabId) {
        chrome.tabs.remove(loginTabId);
        loginTabId = null;
        checkAuthStatus();
        if (!currentAuth?.userInfo) {
          fetchUserInfo().then(() => checkAuthStatus());
        }
      }
    }
  });
});

// 检查认证状态
async function checkAuthStatus() {
  const data = await chrome.storage.local.get(['token', 'cookie', 'userInfo']);
  currentAuth = data;

  const userDisplay = document.getElementById('userDisplay');
  const iconGroup = `<div class="icon-group" style="margin-left: 8px;"><button id="refreshBtn" class="icon-btn" title="刷新认证">🔄</button><button id="copyTokenBtn" class="icon-btn" title="复制Token">🔑</button><button id="copyCookieBtn" class="icon-btn" title="复制Cookie">🍪</button><button id="logoutBtn" class="icon-btn" title="退出登录" style="color: #f44336;">⛔</button></div>`;
  if (data.token && data.cookie) {
    if (data.userInfo) {
      userDisplay.innerHTML = `<img src="${data.userInfo.avatar}" class="user-avatar" alt=""><span style="font-size: 13px;">${data.userInfo.nickname}</span>${iconGroup}`;
    } else {
      userDisplay.innerHTML = `<span style="font-size: 13px; color: #666;">已登录</span>${iconGroup}`;
    }
    document.getElementById('refreshBtn').addEventListener('click', refreshAuth);
    document.getElementById('copyTokenBtn').addEventListener('click', copyToken);
    document.getElementById('copyCookieBtn').addEventListener('click', copyCookie);
    document.getElementById('logoutBtn').addEventListener('click', logout);
  } else {
    userDisplay.innerHTML = '<span style="font-size: 13px; color: #999;">未登录</span><button id="loginBtn" class="login-btn">去登录</button>';
    setTimeout(() => {
      document.getElementById('loginBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://mp.weixin.qq.com' }, (tab) => {
          loginTabId = tab.id;
        });
      });
    }, 0);
  }
}

// 复制Token
async function copyToken() {
  if (!currentAuth.token) {
    alert('Token不存在，请先刷新认证信息');
    return;
  }
  await navigator.clipboard.writeText(currentAuth.token);
  const btn = document.getElementById('copyTokenBtn');
  const originalText = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => btn.textContent = originalText, 1000);
}

// 复制Cookie
async function copyCookie() {
  if (!currentAuth.cookie) {
    alert('Cookie不存在，请先刷新认证信息');
    return;
  }
  await navigator.clipboard.writeText(currentAuth.cookie);
  const btn = document.getElementById('copyCookieBtn');
  const originalText = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => btn.textContent = originalText, 1000);
}

// 提取知乎内容
async function extractZhihu() {
  const urlInput = document.getElementById('zhihuUrlInput').value.trim();

  if (urlInput) {
    if (!urlInput.includes('zhihu.com')) {
      alert('请输入有效的知乎链接');
      return;
    }
    chrome.tabs.create({ url: urlInput, active: false }, async (tab) => {
      setTimeout(async () => {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'extractZhihu' });
          showExtractedContent(response);
          chrome.tabs.remove(tab.id);
        } catch (e) {
          alert('提取失败，请检查链接是否正确');
          chrome.tabs.remove(tab.id);
        }
      }, 2000);
    });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('zhihu.com')) {
      alert('请在知乎页面使用此功能或输入知乎链接');
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'extractZhihu' });
      showExtractedContent(response);
    } catch (e) {
      alert('提取失败，请刷新知乎页面后重试');
    }
  }
}

function showExtractedContent(response) {
  if (response?.title || response?.content) {
    const content = `标题: ${response.title}\n\n${response.content}`;
    navigator.clipboard.writeText(content);
    alert(`已提取并复制到剪贴板\n标题: ${response.title}\n内容长度: ${response.content.length} 字符`);
  } else {
    alert('未能提取到内容');
  }
}

// 刷新认证信息
async function refreshAuth() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url?.includes('mp.weixin.qq.com')) {
    // 不在微信公众平台页面，打开新标签页
    showToast('正在打开微信公众平台，请登录后点击刷新按钮', 3000);
    chrome.tabs.create({ url: 'https://mp.weixin.qq.com' }, (newTab) => {
      loginTabId = newTab.id;
    });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'extractAuth' });
  } catch (e) {
    // Content script 未加载
  }

  await new Promise(resolve => setTimeout(resolve, 300));
  await chrome.storage.local.get(['token', 'cookie']).then(data => {
    currentAuth = { ...currentAuth, ...data };
  });

  // 获取用户信息
  if (currentAuth.token && currentAuth.cookie) {
    await fetchUserInfo();
  }

  await checkAuthStatus();
  showToast('刷新成功');
}

// 退出登录
async function logout() {
  if (!confirm('确定要退出登录吗？')) return;

  // 调用微信退出接口并打开登录页
  if (currentAuth.token) {
    const logoutUrl = `https://mp.weixin.qq.com/cgi-bin/logout?t=wxm-logout&token=${currentAuth.token}&lang=zh_CN`;
    // 通知 background.js 打开登录标签页并监听
    chrome.runtime.sendMessage({ type: 'openLoginTab', url: logoutUrl });
  }

  await chrome.storage.local.remove(['token', 'cookie', 'userInfo']);
  currentAuth = {};
  await checkAuthStatus();
  showToast('已退出登录，请在新标签页扫码登录');
}

// 监听存储变化，自动刷新用户信息
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && (changes.token || changes.cookie)) {
    console.log('[storage] 检测到认证信息变化，自动刷新');
    // 先更新 currentAuth
    const data = await chrome.storage.local.get(['token', 'cookie']);
    currentAuth = { ...currentAuth, ...data };
    // 获取用户信息后再刷新状态
    if (data.token && data.cookie) {
      await fetchUserInfo();
    }
    await checkAuthStatus();
  }
});

// 获取用户信息
async function fetchUserInfo() {
  try {
    const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=${currentAuth.token}`, {
      headers: { 'Cookie': currentAuth.cookie }
    });
    const html = await response.text();

    const nickMatch = html.match(/nick_name\s*[:=]\s*["']([^"']+)["']/);
    const avatarMatch = html.match(/head_img\s*[:=]\s*["']([^"']+)["']/);

    if (nickMatch || avatarMatch) {
      const userInfo = {
        nickname: nickMatch ? nickMatch[1] : '公众号用户',
        avatar: avatarMatch ? avatarMatch[1] : ''
      };
      await chrome.storage.local.set({ userInfo });
      currentAuth.userInfo = userInfo;
    }
  } catch (e) {
    console.error('获取用户信息失败', e);
  }
}

// 搜索公众号
async function searchAccount(page = 0) {
  const query = document.getElementById('searchInput').value.trim();
  if (!query && page === 0) return;

  if (!currentAuth.token || !currentAuth.cookie) {
    alert('请先登录微信公众平台');
    return;
  }

  if (page === 0) currentQuery = query;
  currentPage = page;

  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = '<div class="empty">搜索中...</div>';

  try {
    const begin = page * 5;
    const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/searchbiz?action=search_biz&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&query=${encodeURIComponent(currentQuery)}&begin=${begin}&count=5`, {
      headers: {
        'Cookie': currentAuth.cookie
      }
    });

    const data = await response.json();

    if (data.base_resp?.ret === 0 && data.list?.length > 0) {
      totalAccounts = data.total || 999;
      displayAccounts(data.list);
      updatePagination();
    } else {
      resultsEl.innerHTML = '<div class="empty">未找到相关公众号</div>';
      document.getElementById('pagination').style.display = 'none';
    }
  } catch (error) {
    resultsEl.innerHTML = '<div class="empty">搜索失败，请刷新认证信息</div>';
    document.getElementById('pagination').style.display = 'none';
  }
}

// 更新翻页按钮
function updatePagination() {
  const paginationEl = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');

  paginationEl.style.display = 'block';
  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = false;
  pageInfo.textContent = `第 ${currentPage + 1} 页`;
}

// 显示公众号列表
function displayAccounts(accounts) {
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = accounts.map(acc => `
    <div class="account-item" data-fakeid="${acc.fakeid}">
      <div class="account-header">
        <img src="${acc.round_head_img}" class="avatar" alt="">
        <div class="account-info">
          <div class="account-name">${acc.nickname}</div>
          <div class="account-id">微信号: ${acc.alias || '未设置'}</div>
        </div>
      </div>
      <div class="fakeid">
        fakeid: ${acc.fakeid}
        <button class="copy-btn" data-fakeid="${acc.fakeid}">复制</button>
      </div>
    </div>
  `).join('');

  // 绑定事件
  resultsEl.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('copy-btn')) {
        loadArticles(item.dataset.fakeid);
      }
    });
  });

  resultsEl.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.fakeid);
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = '复制', 1000);
    });
  });
}

// 智能增量更新：只获取最近3天的文章并合并到已有缓存
async function incrementalUpdate(fakeid) {
  console.log(`[incrementalUpdate] 开始增量更新, fakeid: ${fakeid}`);
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  // 1. 从已有缓存中读取文章
  const data = await chrome.storage.local.get(['articleCache']);
  const cachedData = data.articleCache?.[fakeid]?.data || [];

  // 2. 获取最新的文章列表（只获取最近3天的）
  try {
    // 收集最近3天的文章
    const collectRecentArticles = async () => {
      let articles = [];
      let pageBegin = 0;
      const pageCount = 20;

      while (true) {
        const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${fakeid}&type=9&query=&begin=${pageBegin}&count=${pageCount}`, {
          headers: { 'Cookie': currentAuth.cookie }
        });
        const respData = await response.json();

        if (respData.base_resp?.ret !== 0 || !respData.app_msg_list?.length) break;

        for (const art of respData.app_msg_list) {
          // 如果文章超过3天，停止收集
          if (art.create_time * 1000 < threeDaysAgo) {
            return articles;
          }
          articles.push({
            title: art.title,
            link: art.link,
            create_time: art.create_time
          });
        }

        pageBegin += pageCount;
        // 防止无限循环，最多获取10页（约200篇）
        if (pageBegin >= 200) break;
        await new Promise(r => setTimeout(r, 500)); // 短暂延迟
      }
      return articles;
    };

    const recentArticles = await collectRecentArticles();
    console.log(`[incrementalUpdate] 最近3天的文章数: ${recentArticles.length}`);

    // 3. 合并文章（去重，新文章覆盖旧文章）
    const articleMap = new Map();

    // 先添加已有缓存的统计增强数据
    cachedData.forEach(art => {
      if (art.link) {
        articleMap.set(art.link, art);
      }
    });

    // 用新文章列表更新（保留统计信息）
    recentArticles.forEach(art => {
      if (art.link && articleMap.has(art.link)) {
        // 保留已有统计数据
        const existing = articleMap.get(art.link);
        articleMap.set(art.link, {
          ...existing,
          title: art.title,
          create_time: art.create_time
        });
      } else if (art.link) {
        articleMap.set(art.link, art);
      }
    });

    const mergedArticles = Array.from(articleMap.values())
      .sort((a, b) => (b.create_time || 0) - (a.create_time || 0));

    console.log(`[incrementalUpdate] 合并后文章数: ${mergedArticles.length}`);

    // 4. 保存更新后的缓存
    await saveArticleCache(fakeid, mergedArticles);

    return mergedArticles;

  } catch (e) {
    console.error(`[incrementalUpdate] 增量更新失败:`, e);
    return cachedData; // 出错时返回原缓存
  }
}

// 加载文章列表
async function loadArticles(fakeid, page = 0, forceRefresh = false) {
  const loadingId = ++currentLoadingId; // 生成新的加载ID
  if (page === 0) currentFakeid = fakeid;
  currentArticlePage = page;
  showArticleView();

  const articlesEl = document.getElementById('articles');
  const progressEl = document.getElementById('loadingProgress');
  const sortBar = document.getElementById('sortBar');
  const cacheToggleLabel = document.getElementById('cacheToggleLabel');
  const cacheToggle = document.getElementById('articleCacheToggle');

  // 重置排序为时间
  sortBar.style.display = 'none';
  document.getElementById('sortBy').value = 'time';

  // 获取当前账号配置
  const accountConfig = getCurrentAccountConfig();
  const isEnhanced = enableEnhancedMode && accountConfig && accountConfig.uin && accountConfig.key && accountConfig.pass_ticket;

  // 显示/隐藏缓存开关并同步状态
  const exportFullLabel = document.getElementById('exportFullLabel');
  const exportFullToggle = document.getElementById('exportFullToggle');
  if (isEnhanced && accountConfigs[fakeid]) {
    cacheToggleLabel.style.display = 'flex';
    cacheToggle.checked = accountConfigs[fakeid].enableCache !== false;
    // 显示导出全量开关
    exportFullLabel.style.display = 'flex';
  } else {
    cacheToggleLabel.style.display = 'none';
    exportFullLabel.style.display = 'none';
  }

  // 如果启用缓存且非强制刷新，尝试读取缓存并检查是否需要增量更新
  if (!forceRefresh && isEnhanced && accountConfig.enableCache !== false) {
    const cached = await loadArticleCache(fakeid);
    const updatedToday = await isUpdatedToday(fakeid);

    if (cached && cached.length > 0) {
      // 如果今日已更新，直接使用缓存
      if (updatedToday) {
        console.log(`[loadArticles] 今日已更新，直接使用缓存, 文章数: ${cached.length}`);
        enhancedArticlesList = cached;
        currentArticlesList = cached;
        displayEnhancedArticles(cached);
        const hasStats = cached.some(a => a.read_num !== undefined);
        sortBar.style.display = hasStats ? 'flex' : 'none';
        document.getElementById('articlePagination').style.display = 'none';
        return;
      }

      // 今日未更新，执行增量更新
      console.log(`[loadArticles] 今日未更新，执行增量更新`);
      progressEl.style.display = 'inline';
      progressEl.textContent = '正在增量更新...';
      articlesEl.innerHTML = '<div class="empty">正在增量更新...</div>';

      // 后台执行增量更新
      incrementalUpdate(fakeid).then(updatedArticles => {
        console.log(`[loadArticles] 增量更新完成, 文章数: ${updatedArticles.length}`);
        enhancedArticlesList = updatedArticles;
        currentArticlesList = updatedArticles;
        displayEnhancedArticles(updatedArticles);
        const hasStats = updatedArticles.some(a => a.read_num !== undefined);
        sortBar.style.display = hasStats ? 'flex' : 'none';
        document.getElementById('articlePagination').style.display = 'none';
        progressEl.style.display = 'none';
      }).catch(e => {
        console.error(`[loadArticles] 增量更新失败:`, e);
        // 失败时仍然显示原缓存
        enhancedArticlesList = cached;
        currentArticlesList = cached;
        displayEnhancedArticles(cached);
        const hasStats = cached.some(a => a.read_num !== undefined);
        sortBar.style.display = hasStats ? 'flex' : 'none';
        document.getElementById('articlePagination').style.display = 'none';
        progressEl.style.display = 'none';
      });
      return;
    }
  }

  articlesEl.innerHTML = '<div class="empty">加载中...</div>';

  // 使用公众平台API获取文章列表
  try {
    // 检查文章列表缓存（独立于详情数据缓存）
    const listCacheKey = `article_list_${fakeid}`;
    const cachedList = JSON.parse(localStorage.getItem(listCacheKey) || '{"articles":[],"total":0}');
    const allArticles = cachedList.articles || [];
    let begin = allArticles.length;
    const count = 20;

    // 如果有缓存，先显示
    if (allArticles.length > 0 && isEnhanced) {
      totalArticles = cachedList.total;
      console.log(`[loadArticles] 从缓存恢复, 已有: ${allArticles.length}/${totalArticles}`);
      displayEnhancedArticles(allArticles);
      progressEl.style.display = 'inline';
      if (allArticles.length >= totalArticles) {
        progressEl.textContent = `文章列表已完成 ${allArticles.length}/${totalArticles}`;
        enhancedArticlesList = allArticles;
        currentArticlesList = allArticles;
        // 异步获取阅读量
        const articlesWithLink = allArticles.filter(a => a.link);
        if (articlesWithLink.length > 0) {
          loadArticleStatsAsync(fakeid, allArticles, articlesWithLink, loadingId);
        }
        return;
      }
      progressEl.textContent = `正在获取文章列表 ${allArticles.length}/${totalArticles}`;
    }

    // 如果没有缓存，先获取第一页确定总数
    if (allArticles.length === 0) {
      const firstResponse = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${currentFakeid}&type=9&query=&begin=0&count=${count}`, {
        headers: { 'Cookie': currentAuth.cookie }
      });
      const firstData = await firstResponse.json();

      if (firstData.base_resp?.ret === 0 && firstData.app_msg_list?.length > 0) {
        totalArticles = firstData.app_msg_cnt || 0;
        console.log(`[loadArticles] 总文章数: ${totalArticles}, 请求count: ${count}, 实际返回: ${firstData.app_msg_list.length}, loadingId: ${loadingId}`);
        allArticles.push(...firstData.app_msg_list.map(art => ({
          title: art.title,
          link: art.link,
          create_time: art.create_time
        })));
        // 保存缓存
        localStorage.setItem(listCacheKey, JSON.stringify({ articles: allArticles, total: totalArticles }));

        // 先显示第一页
        if (isEnhanced) {
          console.log(`[loadArticles] 显示第一页, 当前数量: ${allArticles.length}`);
          displayEnhancedArticles(allArticles);
          progressEl.style.display = 'inline';
          progressEl.textContent = `正在获取文章列表 ${allArticles.length}/${totalArticles}`;
        } else {
          displayArticles(firstData.app_msg_list);
          updateArticlePagination();
          return;
        }
        begin = allArticles.length;
      } else if (firstData.base_resp?.ret === 200013) {
        articlesEl.innerHTML = '<div class="empty">已限流</div>';
        document.getElementById('articlePagination').style.display = 'none';
        return;
      } else {
        articlesEl.innerHTML = '<div class="empty">暂无文章</div>';
        document.getElementById('articlePagination').style.display = 'none';
        return;
      }
    }

      // 继续获取剩余文章
      begin = allArticles.length; // 从实际获取的数量开始，而不是count
      while (begin < totalArticles && loadingId === currentLoadingId) {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000)); // 1~2秒随机间隔
        if (loadingId !== currentLoadingId) {
          console.log(`[loadArticles] 加载被取消 (while开始), loadingId: ${loadingId}, currentLoadingId: ${currentLoadingId}`);
          break;
        }
        const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${currentFakeid}&type=9&query=&begin=${begin}&count=${count}`, {
          headers: { 'Cookie': currentAuth.cookie }
        });
        const data = await response.json();

        if (loadingId !== currentLoadingId) {
          console.log(`[loadArticles] 加载被取消 (fetch后), loadingId: ${loadingId}, currentLoadingId: ${currentLoadingId}`);
          break;
        }

        if (data.base_resp?.ret === 200013) {
          console.log(`[loadArticles] 文章列表限流，等待3分钟后继续...`);
          progressEl.textContent = '已限流，等待3分钟后继续...';
          await new Promise(r => setTimeout(r, 180000)); // 等待3分钟
          continue;
        }

        if (data.app_msg_list?.length > 0) {
          console.log(`[loadArticles] 请求count: ${count}, 实际返回: ${data.app_msg_list.length}, begin: ${begin}`);
          allArticles.push(...data.app_msg_list.map(art => ({
            title: art.title,
            link: art.link,
            create_time: art.create_time
          })));
          // 保存缓存
          localStorage.setItem(listCacheKey, JSON.stringify({ articles: allArticles, total: totalArticles }));
          console.log(`[loadArticles] 获取更多文章, 当前数量: ${allArticles.length}`);

          // 每50篇等待1分钟
          if (allArticles.length % 50 === 0) {
            console.log(`[loadArticles] 已获取${allArticles.length}篇，等待1分钟...`);
            progressEl.textContent = `已获取${allArticles.length}篇，等待1分钟后继续...`;
            await new Promise(r => setTimeout(r, 60000));
          };
          progressEl.textContent = `正在获取文章列表 ${allArticles.length}/${totalArticles}`;
          displayEnhancedArticles(allArticles);
        }

        // 如果没有返回文章，退出循环
        if (!data.app_msg_list || data.app_msg_list.length === 0) break;
        begin = allArticles.length; // 基于实际获取的数量
      }

      if (loadingId !== currentLoadingId) {
        console.log(`[loadArticles] 加载被取消 (while结束后), loadingId: ${loadingId}, currentLoadingId: ${currentLoadingId}`);
        return;
      }

      console.log(`[loadArticles] 文章列表获取完成, 总数: ${allArticles.length}, loadingId: ${loadingId}`);
      enhancedArticlesList = allArticles;
      currentArticlesList = allArticles;
      document.getElementById('articlePagination').style.display = 'none';

      // 异步获取阅读量
      const articlesWithLink = allArticles.filter(a => a.link);
      if (articlesWithLink.length > 0) {
        loadArticleStatsAsync(fakeid, allArticles, articlesWithLink, loadingId);
      }
  } catch (error) {
    articlesEl.innerHTML = '<div class="empty">加载失败</div>';
    document.getElementById('articlePagination').style.display = 'none';
  }
}

// 增强模式加载文章（带阅读量）
async function loadEnhancedArticles(fakeid, page = 0) {
  const articlesEl = document.getElementById('articles');
  articlesEl.innerHTML = '<div class="empty">加载中（增强模式）...</div>';

  // 获取当前账号配置
  const accountConfig = accountConfigs[fakeid] || {};
  const uin = globalUin || '';

  const offset = page * 10;
  const response = await chrome.runtime.sendMessage({
    type: 'fetchProfileArticles',
    biz: fakeid,
    uin: uin,
    key: accountConfig.key || '',
    pass_ticket: accountConfig.pass_ticket || '',
    offset
  });

  console.log('fetchProfileArticles response:', response);

  if (response.error || !response.general_msg_list) {
    console.log('fetchProfileArticles failed - error:', response.error, 'general_msg_list:', response.general_msg_list);
    return false; // 增强模式失败
  }

  let msgList;
  try {
    msgList = JSON.parse(response.general_msg_list).list || [];
  } catch (e) {
    return false;
  }

  if (msgList.length === 0) {
    if (page === 0) {
      articlesEl.innerHTML = '<div class="empty">暂无文章</div>';
      document.getElementById('articlePagination').style.display = 'none';
    }
    return true;
  }

  // 解析文章列表
  const articles = [];
  for (const item of msgList) {
    const info = item.app_msg_ext_info;
    if (info) {
      articles.push({
        title: info.title,
        link: info.content_url?.replace(/&amp;/g, '&'),
        cover: info.cover,
        create_time: item.comm_msg_info?.datetime || 0
      });
      // 多图文
      if (info.multi_app_msg_item_list) {
        for (const sub of info.multi_app_msg_item_list) {
          articles.push({
            title: sub.title,
            link: sub.content_url?.replace(/&amp;/g, '&'),
            cover: sub.cover,
            create_time: item.comm_msg_info?.datetime || 0
          });
        }
      }
    }
  }

  enhancedArticlesList = articles;
  currentArticlesList = articles;
  document.getElementById('sortBy').value = 'time';
  displayEnhancedArticles(articles);
  updateArticlePagination();

  // 获取所有文章的阅读量（不使用缓存）
  const articlesWithLink = articles.filter(a => a.link);
  if (articlesWithLink.length > 0) {
    loadArticleStatsAsync(fakeid, articles, articlesWithLink);
  }

  return true;
}

// 异步加载阅读量（并发模式）
async function loadArticleStatsAsync(fakeid, allArticles, articlesToFetch, loadingId) {
  console.log(`[loadArticleStatsAsync] 开始获取阅读量, 文章数: ${allArticles.length}, 待获取: ${articlesToFetch.length}, loadingId: ${loadingId}`);
  isLoadingStats = true;
  const progressEl = document.getElementById('loadingProgress');
  const sortBar = document.getElementById('sortBar');
  sortBar.style.display = 'none';
  progressEl.style.display = 'inline';

  const accountConfig = getCurrentAccountConfig();
  const total = articlesToFetch.length;
  let completed = 0;
  const CONCURRENCY = 4;

  const updateProgress = () => {
    const remaining = total - completed;
    const remainingSec = Math.ceil(remaining / CONCURRENCY * 0.5);
    progressEl.textContent = `正在获取 ${completed}/${total} 约${remainingSec}秒`;
  };
  updateProgress();

  // 获取单篇文章统计数据，返回状态: 'success' | 'failed' | 'rate_limited'
  const fetchSingleStat = async (art) => {
    try {
      const urlParams = new URL(art.link).searchParams;
      const mid = urlParams.get('mid');
      const sn = urlParams.get('sn');
      const idx = urlParams.get('idx') || '1';

      if (mid && sn && accountConfig) {
        const stats = await chrome.runtime.sendMessage({
          type: 'fetchArticleStats',
          biz: fakeid,
          uin: accountConfig.uin,
          key: accountConfig.key,
          pass_ticket: accountConfig.pass_ticket,
          mid, sn, idx,
          title: art.title || ''
        });

        // 检测限流
        if (stats.base_resp?.ret === 200013) {
          console.log('[fetchSingleStat] 检测到限流, ret:', stats.base_resp?.ret);
          return 'rate_limited';
        }

        if (stats.appmsgstat) {
          art.read_num = stats.appmsgstat.read_num || 0;
          art.like_num = stats.appmsgstat.like_num || stats.appmsgstat.old_like_num || 0;
          art.share_num = stats.appmsgstat.share_num || 0;
          art.star_num = stats.appmsgstat.fav_num || stats.appmsgstat.star_num || 0;

          // 获取评论数据
          try {
            const htmlRes = await chrome.runtime.sendMessage({ type: 'fetchArticleHtml', url: art.link });
            if (htmlRes.comment_id) {
              art.comment_id = htmlRes.comment_id;
              const commentsRes = await chrome.runtime.sendMessage({
                type: 'fetchArticleComments',
                biz: fakeid,
                uin: accountConfig.uin,
                key: accountConfig.key,
                pass_ticket: accountConfig.pass_ticket,
                mid, idx,
                comment_id: htmlRes.comment_id
              });
              if (commentsRes && !commentsRes.error) {
                art.comment_count = commentsRes.elected_comment_total_cnt || 0;
                art.comments = commentsRes.elected_comment || [];
              }
            }
          } catch (e) { console.log('获取评论失败', e); }

          updateArticleStatsDisplay(art.link, art.read_num, art.like_num, art.share_num, art.star_num, art.comment_count);
          return 'success';
        }
      }
    } catch (e) {
      console.log('获取阅读量失败', e);
    }
    return 'failed';
  };

  // 先检查第一个请求
  if (articlesToFetch.length > 0) {
    const firstResult = await fetchSingleStat(articlesToFetch[0]);
    completed++;
    if (firstResult === 'rate_limited') {
      handleRateLimit(fakeid, articlesToFetch.slice(0), loadingId, allArticles);
      return;
    }
    if (firstResult === 'failed') {
      // 凭证失效也调用 handleRateLimit 打开设置模态框
      handleRateLimit(fakeid, articlesToFetch.slice(0), loadingId, allArticles);
      return;
    }
    updateProgress();
    await new Promise(r => setTimeout(r, 200));
  }

  // 并发控制
  const queue = articlesToFetch.slice(1);
  let rateLimited = false;
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0 && loadingId === currentLoadingId && !rateLimited) {
        const art = queue.shift();
        if (art) {
          const result = await fetchSingleStat(art);
          if (result === 'rate_limited') {
            rateLimited = true;
            // 把当前文章放回队列
            queue.unshift(art);
            handleRateLimit(fakeid, queue.slice(0), loadingId, allArticles);
            return;
          }
          completed++;
          updateProgress();
          // 每50篇等待1分钟
          if (completed % 50 === 0) {
            console.log(`[loadArticleStatsAsync] 已获取${completed}篇详情，等待1分钟...`);
            progressEl.textContent = `已获取${completed}篇详情，等待1分钟后继续...`;
            await new Promise(r => setTimeout(r, 60000));
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    })());
  }
  await Promise.all(workers);

  // 如果被限流，不继续后续处理
  if (rateLimited) {
    return;
  }

  // 检查加载是否仍然有效
  if (loadingId !== currentLoadingId) {
    console.log(`[loadArticleStatsAsync] 加载被取消, loadingId: ${loadingId}, currentLoadingId: ${currentLoadingId}`);
    isLoadingStats = false;
    return;
  }

  console.log(`[loadArticleStatsAsync] 阅读量获取完成, 文章数: ${allArticles.length}, loadingId: ${loadingId}`);
  progressEl.textContent = '数据加载完成';
  progressEl.style.color = '#666';
  setTimeout(() => {
    progressEl.style.display = 'none';
    sortBar.style.display = 'flex';
  }, 1500);
  isLoadingStats = false;
  enhancedArticlesList = allArticles;

  // 如果启用缓存，保存数据（包含统计数据）
  const config = accountConfigs[fakeid];
  if (config && config.enableCache !== false) {
    await saveArticleCache(fakeid, allArticles);
  }
}

// 处理限流情况
function handleRateLimit(fakeid, remainingQueue, loadingId, allArticles) {
  console.log('[handleRateLimit] 开始处理限流, fakeid:', fakeid, 'remainingQueue:', remainingQueue.length);
  // 保存限流状态
  rateLimitedFakeid = fakeid;
  rateLimitedQueue = remainingQueue;
  rateLimitedLoadingId = loadingId;
  rateLimitedAllArticles = allArticles;

  // 获取账号名称
  const accountName = accountConfigs[fakeid]?.name || fakeid;
  console.log('[handleRateLimit] 账号名称:', accountName);

  // 更新进度提示
  const progressEl = document.getElementById('loadingProgress');
  progressEl.textContent = `已限流，请更新参数后继续`;
  progressEl.style.color = '#ff9800';

  // 打开设置模态框
  console.log('[handleRateLimit] 打开设置模态框');
  openSettingsModal();

  // 显示限流提示
  showToast(`已限流，请更新「${accountName}」的 key 和 pass_ticket`, 5000);

  // 高亮对应账号的输入框
  console.log('[handleRateLimit] 延迟100ms后高亮输入框');
  setTimeout(() => highlightAccountInputs(fakeid), 100);
}

// 高亮需要更新的输入框
function highlightAccountInputs(fakeid) {
  console.log('[highlightAccountInputs] 开始高亮, fakeid:', fakeid);
  // 移除之前的高亮
  document.querySelectorAll('.flash-warning').forEach(el => el.classList.remove('flash-warning'));

  // 找到对应账号的配置项
  const configItem = document.querySelector(`.account-config-item[data-fakeid="${fakeid}"]`);
  console.log('[highlightAccountInputs] 找到配置项:', configItem);
  if (configItem) {
    const keyInput = configItem.querySelector('.config-key');
    const passTicketInput = configItem.querySelector('.config-pass-ticket');
    console.log('[highlightAccountInputs] keyInput:', keyInput, 'passTicketInput:', passTicketInput);

    // 清空失效账号的输入框
    if (keyInput) keyInput.value = '';
    if (passTicketInput) passTicketInput.value = '';

    keyInput?.classList.add('flash-warning');
    passTicketInput?.classList.add('flash-warning');

    // 滚动到该配置项
    configItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    console.log('[highlightAccountInputs] 未找到配置项, 所有配置项:', document.querySelectorAll('.account-config-item'));
  }
}

// 继续获取被限流中断的文章数据
async function resumeRateLimitedFetch() {
  console.log('[resumeRateLimitedFetch] 开始恢复获取, fakeid:', rateLimitedFakeid, 'queue:', rateLimitedQueue.length);
  const fakeid = rateLimitedFakeid;
  const queue = rateLimitedQueue;
  const loadingId = rateLimitedLoadingId;
  const allArticles = rateLimitedAllArticles;

  // 清除限流状态
  rateLimitedFakeid = null;
  rateLimitedQueue = [];
  rateLimitedLoadingId = null;
  rateLimitedAllArticles = null;

  // 移除高亮
  document.querySelectorAll('.flash-warning').forEach(el => el.classList.remove('flash-warning'));

  if (!fakeid || queue.length === 0 || !allArticles) {
    console.log('[resumeRateLimitedFetch] 无需恢复, fakeid:', fakeid, 'queue:', queue?.length, 'allArticles:', !!allArticles);
    return;
  }

  // 重新获取账号配置
  const data = await chrome.storage.local.get(['accountConfigs', 'globalUin']);
  accountConfigs = data.accountConfigs || {};
  globalUin = data.globalUin || '';
  console.log('[resumeRateLimitedFetch] 重新加载配置完成, 继续获取剩余', queue.length, '篇文章');

  // 继续获取剩余文章
  showToast(`继续获取剩余 ${queue.length} 篇文章数据...`, 2000);
  await loadArticleStatsAsync(fakeid, allArticles, queue, loadingId);
}

// 加载文章缓存
async function loadArticleCache(fakeid) {
  const data = await chrome.storage.local.get(['articleCache']);
  const allCache = data.articleCache || {};
  const accountCache = allCache[fakeid];
  if (accountCache && Date.now() - accountCache.timestamp < CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000) {
    return accountCache.data || [];
  }
  return null;
}

// 保存文章缓存
async function saveArticleCache(fakeid, articles) {
  const data = await chrome.storage.local.get(['articleCache']);
  const allCache = data.articleCache || {};
  allCache[fakeid] = { timestamp: Date.now(), data: articles };
  // 清理过期缓存
  for (const key in allCache) {
    if (Date.now() - allCache[key].timestamp > CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000) {
      delete allCache[key];
    }
  }
  await chrome.storage.local.set({ articleCache: allCache });
  // 记录今日已更新
  await markUpdatedToday(fakeid);
}

// 实时更新单篇文章的阅读量显示
function updateArticleStatsDisplay(link, readNum, likeNum, shareNum, starNum, commentCount) {
  const statsEl = document.querySelector(`.article-item[data-link="${link}"] .article-stats`);
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="stats-read">阅读 ${readNum.toLocaleString()}</span>
      <span class="stats-like">点赞 ${likeNum.toLocaleString()}</span>
      <span class="stats-share">分享 ${shareNum.toLocaleString()}</span>
      <span class="stats-star">收藏 ${starNum.toLocaleString()}</span>
      <span class="stats-comment" style="color: #4caf50; cursor: pointer;" data-link="${link}">评论 ${commentCount !== undefined ? commentCount : '-'}</span>
    `;
    // 绑定评论点击事件
    const commentEl = statsEl.querySelector('.stats-comment');
    if (commentEl && commentCount !== undefined) {
      commentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showCommentsModal(link);
      });
    }
  }
}

// 加载缓存
async function loadStatsCache(fakeid) {
  const data = await chrome.storage.local.get(['statsCache']);
  const allCache = data.statsCache || {};
  const accountCache = allCache[fakeid];
  if (accountCache && Date.now() - accountCache.timestamp < CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000) {
    return accountCache.data || {};
  }
  return {};
}

// 保存缓存
async function saveStatsCache(fakeid, cache) {
  const data = await chrome.storage.local.get(['statsCache']);
  const allCache = data.statsCache || {};
  allCache[fakeid] = { timestamp: Date.now(), data: cache };
  // 清理过期缓存
  for (const key in allCache) {
    if (Date.now() - allCache[key].timestamp > CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000) {
      delete allCache[key];
    }
  }
  await chrome.storage.local.set({ statsCache: allCache });
}

// 显示增强模式文章列表（带阅读量）
function displayEnhancedArticles(articles) {
  console.log(`[displayEnhancedArticles] 显示文章数量: ${articles.length}`);
  const articlesEl = document.getElementById('articles');
  articlesEl.innerHTML = articles.map(art => `
    <div class="article-item" data-link="${art.link || ''}">
      <div class="article-title" data-link="${art.link || ''}">${art.title}</div>
      <div class="article-meta">
        ${art.create_time ? new Date(art.create_time * 1000).toLocaleDateString() : ''}
        <button class="copy-btn" data-link="${art.link || ''}">复制链接</button>
        <button class="copy-btn" data-link="${art.link || ''}" data-title="${(art.title || '').replace(/"/g, '&quot;')}" style="background: #ff9800; margin-left: 4px;">导出</button>
      </div>
      <div class="article-stats">
        <span class="stats-read">阅读 ${art.read_num !== undefined ? art.read_num.toLocaleString() : '-'}</span>
        <span class="stats-like">点赞 ${art.like_num !== undefined ? art.like_num.toLocaleString() : '-'}</span>
        <span class="stats-share">分享 ${art.share_num !== undefined ? art.share_num.toLocaleString() : '-'}</span>
        <span class="stats-star">收藏 ${art.star_num !== undefined ? art.star_num.toLocaleString() : '-'}</span>
        <span class="stats-comment" style="color: #4caf50; cursor: pointer;" data-link="${art.link || ''}">评论 ${art.comment_count !== undefined ? art.comment_count : '-'}</span>
      </div>
    </div>
  `).join('');

  articlesEl.querySelectorAll('.article-title').forEach(title => {
    title.addEventListener('click', () => {
      if (title.dataset.link) chrome.tabs.create({ url: title.dataset.link });
    });
  });

  articlesEl.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.textContent === '导出') {
        await exportSingleArticle(btn.dataset.link, btn.dataset.title);
      } else {
        navigator.clipboard.writeText(btn.dataset.link);
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制链接', 1000);
      }
    });
  });

  // 绑定评论点击事件
  articlesEl.querySelectorAll('.stats-comment').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const link = el.dataset.link;
      if (link) showCommentsModal(link);
    });
  });
}

// 更新文章翻页按钮
function updateArticlePagination() {
  const paginationEl = document.getElementById('articlePagination');
  const prevBtn = document.getElementById('prevArticleBtn');
  const nextBtn = document.getElementById('nextArticleBtn');
  const pageInfo = document.getElementById('articlePageInfo');

  paginationEl.style.display = 'block';
  prevBtn.disabled = currentArticlePage === 0;
  nextBtn.disabled = false;
  pageInfo.textContent = `第 ${currentArticlePage + 1} 页`;
}

// 显示文章列表
function displayArticles(articles) {
  const articlesEl = document.getElementById('articles');
  articlesEl.innerHTML = articles.map(art => `
    <div class="article-item">
      <div class="article-title" data-link="${art.link}">${art.title}</div>
      <div class="article-meta">
        ${new Date(art.create_time * 1000).toLocaleDateString()}
        <button class="copy-btn" data-link="${art.link}">复制链接</button>
        <button class="copy-btn" data-link="${art.link}" data-title="${art.title.replace(/"/g, '&quot;')}" style="background: #ff9800; margin-left: 4px;">导出</button>
      </div>
    </div>
  `).join('');

  articlesEl.querySelectorAll('.article-title').forEach(title => {
    title.addEventListener('click', () => {
      chrome.tabs.create({ url: title.dataset.link });
    });
  });

  articlesEl.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.textContent === '导出') {
        await exportSingleArticle(btn.dataset.link, btn.dataset.title);
      } else {
        navigator.clipboard.writeText(btn.dataset.link);
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制链接', 1000);
      }
    });
  });
}

// 视图切换
function showSearchView() {
  // 中断正在进行的加载
  currentLoadingId++;
  console.log('[showSearchView] 中断后台请求, currentLoadingId:', currentLoadingId);

  document.getElementById('searchView').style.display = 'block';
  document.getElementById('articleView').style.display = 'none';
  document.getElementById('articlePagination').style.display = 'none';
  // 恢复搜索翻页显示状态
  if (totalAccounts > 0) {
    document.getElementById('pagination').style.display = 'block';
  }
}

function showArticleView() {
  document.getElementById('searchView').style.display = 'none';
  document.getElementById('articleView').style.display = 'block';
  document.getElementById('pagination').style.display = 'none';
}

// 加载微信文章列表
async function loadWxArticles() {
  const data = await chrome.storage.local.get(['articles']);
  const articles = data.articles || [];

  const listEl = document.getElementById('wxArticlesList');
  const rightPanel = document.getElementById('wxRightPanel');
  const mainContainer = document.getElementById('wxMainContainer');

  if (articles.length === 0) {
    listEl.innerHTML = '<div class="empty">暂无保存的文章</div>';
    rightPanel.classList.add('hidden');
    mainContainer.classList.add('full-width');
    return;
  }

  rightPanel.classList.remove('hidden');
  mainContainer.classList.remove('full-width');

  listEl.innerHTML = articles.map((art, idx) => {
    // 从文章中提取的账号名称
    const accountName = art.accountName || '未知账号';
    // 发布时间
    const publishTime = art.publishTime || '';
    // 地区
    const region = art.region || '';

    return `
      <div class="wx-article-item">
        <div class="wx-article-header">
          <a class="wx-article-title-link" href="${art.url}" target="_blank" title="${art.title}">${art.title}</a>
        </div>
        <div class="wx-article-meta">
          <span class="meta-account" title="账号">${accountName}</span>
          ${publishTime ? `<span class="meta-time" title="发布时间">${publishTime}</span>` : ''}
          ${region ? `<span class="meta-region" title="地区">${region}</span>` : ''}
        </div>
        <div class="wx-article-actions">
          <button class="action-btn copy-content-btn" data-idx="${idx}" title="复制文案">复制文案</button>
          <button class="action-btn export-btn" data-idx="${idx}" title="导出文案">导出文案</button>
          <button class="action-btn delete-btn" data-idx="${idx}" title="删除">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定按钮事件
  listEl.querySelectorAll('.copy-content-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const art = articles[idx];
      const text = `标题: ${art.title}\n\n${art.content}`;
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = '复制文案', 1500);
    });
  });

  listEl.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const art = articles[idx];
      // 导出为文本文件
      const text = `标题: ${art.title}\n\n${art.content}`;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${art.title.slice(0, 30)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      if (confirm('确定要删除这篇文章吗？')) {
        articles.splice(idx, 1);
        await chrome.storage.local.set({ articles });
        loadWxArticles();
      }
    });
  });
}

// 复制所有微信文章
async function copyAllArticles() {
  const data = await chrome.storage.local.get(['articles']);
  const articles = data.articles || [];

  if (articles.length === 0) {
    alert('暂无保存的文章');
    return;
  }

  const text = articles.map(art => `标题: ${art.title}\n\n${art.content}`).join('\n\n---\n\n');
  await navigator.clipboard.writeText(text);
  alert(`已复制 ${articles.length} 篇文章到剪贴板`);
}

// 加载知乎文章列表
async function loadZhihuArticles() {
  const data = await chrome.storage.local.get(['zhihuArticles']);
  const articles = data.zhihuArticles || [];

  const listEl = document.getElementById('zhArticlesList');
  const rightPanel = document.getElementById('zhRightPanel');
  const mainContainer = document.getElementById('zhMainContainer');

  if (articles.length === 0) {
    listEl.innerHTML = '<div class="empty">暂无保存的文章</div>';
    rightPanel.classList.add('hidden');
    mainContainer.classList.add('full-width');
    return;
  }

  rightPanel.classList.remove('hidden');
  mainContainer.classList.remove('full-width');

  listEl.innerHTML = articles.map((art, idx) => `
    <div class="wx-article-item">
      <div class="wx-article-title">${art.title}</div>
      <div class="wx-article-url">${art.url}</div>
      <button class="copy-btn" data-idx="${idx}">复制</button>
      <button class="copy-btn" data-idx="${idx}" style="background: #f44336; margin-left: 4px;">删除</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      if (btn.textContent === '删除') {
        articles.splice(idx, 1);
        await chrome.storage.local.set({ zhihuArticles: articles });
        loadZhihuArticles();
      } else {
        const art = articles[idx];
        const text = `标题: ${art.title}\n\n${art.content}`;
        navigator.clipboard.writeText(text);
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制', 1000);
      }
    });
  });
}

// 复制所有知乎文章
async function copyAllZhihu() {
  const data = await chrome.storage.local.get(['zhihuArticles']);
  const articles = data.zhihuArticles || [];

  if (articles.length === 0) {
    alert('暂无保存的知乎文章');
    return;
  }

  const text = articles.map(art => `标题: ${art.title}\n\n${art.content}`).join('\n\n---\n\n');
  await navigator.clipboard.writeText(text);
  alert(`已复制 ${articles.length} 篇知乎文章到剪贴板`);
}

// 删除所有微信文章
async function deleteAllArticles() {
  const data = await chrome.storage.local.get(['articles']);
  const articles = data.articles || [];

  if (articles.length === 0) {
    alert('暂无保存的文章');
    return;
  }

  if (confirm(`确定要删除所有 ${articles.length} 篇文章吗？`)) {
    await chrome.storage.local.set({ articles: [] });
    loadWxArticles();
  }
}

// 删除所有知乎文章
async function deleteAllZhihu() {
  const data = await chrome.storage.local.get(['zhihuArticles']);
  const articles = data.zhihuArticles || [];

  if (articles.length === 0) {
    alert('暂无保存的知乎文章');
    return;
  }

  if (confirm(`确定要删除所有 ${articles.length} 篇知乎文章吗？`)) {
    await chrome.storage.local.set({ zhihuArticles: [] });
    loadZhihuArticles();
  }
}

// 获取文章内容
async function fetchArticleContent(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'fetchArticle', url }, async (response) => {
      if (response?.useTab) {
        // 使用标签页方式
        chrome.tabs.create({ url, active: false }, (tab) => {
          setTimeout(async () => {
            try {
              const result = await chrome.tabs.sendMessage(tab.id, { type: 'getContent' });
              chrome.tabs.remove(tab.id);
              const content = result?.content || '';
              const extractedTitle = extractTimeFromContent(content, result?.publishTime);
              resolve({ title: extractedTitle || `无标题_${Date.now()}`, content });
            } catch (e) {
              chrome.tabs.remove(tab.id);
              resolve({ title: `无标题_${Date.now()}`, content: '' });
            }
          }, 3000);
        });
      } else {
        resolve(response);
      }
    });
  });
}

// 从内容结尾提取时间
function extractTimeFromContent(content, publishTime) {
  if (publishTime) {
    return publishTime + '随笔';
  }
  const lines = content.trim().split('\n').filter(l => l.trim());
  const lastLine = lines[lines.length - 1]?.trim() || '';
  const match = lastLine.match(/(\d{4}年\d{1,2}月\d{1,2}日\d{1,2}:\d{2})/);
  return match ? match[1] + '随笔' : null;
}

// 下载文本文件
function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[<>:"/\\|?*]/g, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导出单篇文章
async function exportSingleArticle(url, title) {
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '导出中...';
  btn.disabled = true;

  const result = await fetchArticleContent(url);
  let finalTitle = result.title || title;
  if (finalTitle.startsWith('无标题')) {
    finalTitle = extractTimeFromContent(result.content) || finalTitle;
  }
  const text = `标题：${finalTitle}\n\n内容：${result.content}`;
  downloadTextFile(finalTitle, text);

  btn.textContent = '已导出';
  btn.disabled = false;
  setTimeout(() => btn.textContent = originalText, 2000);
}

// 生成全量导出内容（包含统计信息）
function generateFullExportContent(article, content) {
  let text = `标题：${article.title}\n`;
  text += `链接：${article.link}\n`;

  // 添加发布时间
  if (article.create_time) {
    text += `发布时间：${new Date(article.create_time * 1000).toLocaleString()}\n`;
  }

  // 添加统计数据（始终显示统计部分，有数据显示数据，无数据显示"未获取"）
  text += `\n======== 数据统计 ========\n`;
  text += `阅读量：${article.read_num !== undefined ? article.read_num.toLocaleString() : '未获取'}\n`;
  text += `点赞数：${article.like_num !== undefined ? article.like_num.toLocaleString() : '未获取'}\n`;
  text += `分享数：${article.share_num !== undefined ? article.share_num.toLocaleString() : '未获取'}\n`;
  text += `收藏数：${article.star_num !== undefined ? article.star_num.toLocaleString() : '未获取'}\n`;
  text += `评论数：${article.comment_count !== undefined ? article.comment_count.toLocaleString() : '未获取'}\n`;

  // 添加评论内容
  if (article.comments && article.comments.length > 0) {
    text += `\n======== 精选评论 ========\n`;
    article.comments.forEach((c, idx) => {
      text += `\n【评论 ${idx + 1}】\n`;
      if (c.nick_name) text += `用户：${c.nick_name}\n`;
      if (c.content) text += `内容：${c.content}\n`;
      if (c.create_time) text += `时间：${new Date(c.create_time * 1000).toLocaleString()}\n`;
      if (c.like_num) text += `点赞：${c.like_num}\n`;
    });
  }

  text += `\n======== 文章内容 ========\n\n${content}`;
  return text;
}

// 导出当前页文章（前20篇）
async function exportCurrentArticles() {
  const btn = document.getElementById('exportCurrentBtn');
  btn.textContent = '导出中...';
  btn.disabled = true;

  // 获取当前页显示的文章（前20篇）
  const pageSize = 20;
  let articlesToExport = currentArticlesList.slice(0, pageSize);
  const exportFull = document.getElementById('exportFullToggle')?.checked;

  if (!articlesToExport || articlesToExport.length === 0) {
    showToast('没有可导出的文章');
    btn.textContent = '导出当前';
    btn.disabled = false;
    return;
  }

  for (const art of articlesToExport) {
    if (stopExport) break;
    const result = await fetchArticleContent(art.link);
    let finalTitle = result.title || art.title;
    if (finalTitle.startsWith('无标题')) {
      finalTitle = extractTimeFromContent(result.content) || finalTitle;
    }

    let text;
    if (exportFull) {
      // 使用文章的统计数据（如果有）
      const fullArticle = currentArticlesList.find(a => a.link === art.link) || art;
      text = generateFullExportContent(fullArticle, result.content);
    } else {
      text = `标题：${finalTitle}\n\n内容：${result.content}`;
    }
    downloadTextFile(finalTitle, text);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  btn.textContent = '已完成';
  btn.disabled = false;
  setTimeout(() => {
    btn.textContent = '导出当前';
    btn.disabled = false;
  }, 2000);
}

// 导出所有文章
let stopExport = false;

async function exportAllArticles() {
  const exportFull = document.getElementById('exportFullToggle')?.checked;

  // 优先尝试从缓存导出
  const cached = await loadArticleCache(currentFakeid);
  if (cached && cached.length > 0) {
    const useCache = confirm(`检测到缓存中有 ${cached.length} 篇文章，是否直接从缓存导出？\n\n确定=从缓存导出（快速）\n取消=从服务器获取全部文章（较慢）`);
    if (useCache) {
      const btn = document.getElementById('exportAllBtn');
      const originalText = btn.textContent;
      btn.textContent = '导出中...';
      btn.disabled = true;

      let exportedCount = 0;
      for (const art of cached) {
        if (stopExport) break;
        const result = await fetchArticleContent(art.link);
        let finalTitle = result.title || art.title;
        if (finalTitle.startsWith('无标题')) {
          finalTitle = extractTimeFromContent(result.content) || finalTitle;
        }

        let text;
        if (exportFull) {
          text = generateFullExportContent(art, result.content);
        } else {
          text = `标题：${finalTitle}\n\n内容：${result.content}`;
        }
        downloadTextFile(finalTitle, text);
        exportedCount++;
        btn.textContent = `导出中 (${exportedCount}/${cached.length})`;
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      btn.textContent = `已完成 (${exportedCount})`;
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }
  }

  // 检查是否有未完成的导出任务
  const savedProgress = await chrome.storage.local.get(['exportProgress']);
  let startPage = 0;
  let startCount = 0;

  if (savedProgress.exportProgress && savedProgress.exportProgress.fakeid === currentFakeid) {
    if (confirm(`检测到上次导出中断，已导出 ${savedProgress.exportProgress.exportedCount} 篇，是否继续？\n\n确定=继续，取消=重新开始`)) {
      startPage = savedProgress.exportProgress.page;
      startCount = savedProgress.exportProgress.exportedCount;
    } else {
      await chrome.storage.local.remove(['exportProgress']);
    }
  } else if (!confirm('将导出该账号的所有文章，可能需要较长时间，是否继续？')) {
    return;
  }

  const btn = document.getElementById('exportAllBtn');
  const originalText = btn.textContent;
  btn.textContent = '停止导出';
  btn.style.background = '#f44336';
  stopExport = false;

  const stopHandler = () => {
    stopExport = true;
    btn.textContent = '正在停止...';
    btn.disabled = true;
  };
  btn.onclick = stopHandler;

  let page = startPage;
  let exportedCount = startCount;
  let rateLimited = false;

  try {
    while (!stopExport) {
      const begin = page * 5;
      const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${currentFakeid}&type=9&query=&begin=${begin}&count=5`, {
        headers: { 'Cookie': currentAuth.cookie }
      });

      const data = await response.json();

      if (data.base_resp?.ret === 200013) {
        rateLimited = true;
        await chrome.storage.local.set({ exportProgress: { fakeid: currentFakeid, page, exportedCount } });
        alert(`已限流！进度已保存（已导出 ${exportedCount} 篇），请更换账号继续`);
        break;
      }

      if (data.base_resp?.ret === 0 && data.app_msg_list?.length > 0) {
        for (const art of data.app_msg_list) {
          if (stopExport) break;

          const result = await fetchArticleContent(art.link);
          let finalTitle = result.title || art.title;
          if (finalTitle.startsWith('无标题')) {
            finalTitle = extractTimeFromContent(result.content) || finalTitle;
          }

          let text;
          if (exportFull) {
            // 尝试从缓存中获取带统计数据的文章
            const fullArticle = cached.find(a => a.link === art.link) || art;
            text = generateFullExportContent(fullArticle, result.content);
          } else {
            text = `标题：${finalTitle}\n\n内容：${result.content}`;
          }
          downloadTextFile(finalTitle, text);
          exportedCount++;
          btn.textContent = `停止 (${exportedCount})`;
          await chrome.storage.local.set({ exportProgress: { fakeid: currentFakeid, page, exportedCount } });
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        }

        if (stopExport || exportedCount >= data.app_msg_cnt || data.app_msg_list.length === 0) break;
        page++;
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        break;
      }
    }
  } catch (e) {
    await chrome.storage.local.set({ exportProgress: { fakeid: currentFakeid, page, exportedCount } });
    alert(`导出出错，进度已保存（已导出 ${exportedCount} 篇）`);
  }

  if (!rateLimited && !stopExport) {
    await chrome.storage.local.remove(['exportProgress']);
  } else if (stopExport) {
    await chrome.storage.local.set({ exportProgress: { fakeid: currentFakeid, page, exportedCount } });
  }

  btn.textContent = rateLimited ? `已限流 (${exportedCount})` : (stopExport ? `已停止 (${exportedCount})` : '导出完成');
  btn.style.background = '';
  btn.disabled = false;
  btn.onclick = exportAllArticles;
  setTimeout(() => btn.textContent = originalText, 2000);
}

// ============= 数据导入导出功能 =============

// 导出单个账号的所有缓存数据（使用文件夹结构）
async function exportSingleAccountData(fakeid) {
  const config = accountConfigs[fakeid];
  const articles = await loadArticleCache(fakeid);

  if (!articles || articles.length === 0) {
    showToast('该账号暂无缓存数据');
    return;
  }

  const accountName = config?.name || fakeid;

  // 确认导出
  if (!confirm(`即将导出「${accountName}」的 ${articles.length} 篇文章，是否继续？`)) {
    return;
  }

  try {
    // 使用保存的目录或提示用户选择
    const dirHandle = await getOrCreateExportDir();

    // 创建账号文件夹
    const safeAccountName = accountName.replace(/[<>:"/\\|?*]/g, '_');
    const accountDirHandle = await dirHandle.getDirectoryHandle(safeAccountName, { create: true });

    let exportedCount = 0;
    showToast(`开始导出 ${articles.length} 篇文章...`);

    for (const art of articles) {
      try {
        const result = await fetchArticleContent(art.link);
        let finalTitle = result.title || art.title;
        if (finalTitle.startsWith('无标题')) {
          finalTitle = extractTimeFromContent(result.content) || finalTitle;
        }

        // 默认导出全量数据（包含统计信息、评论等）
        const text = generateFullExportContent(art, result.content);

        // 清理文件名并写入文件
        const safeFileName = finalTitle.replace(/[<>:"/\\|?*]/g, '_');
        const fileHandle = await accountDirHandle.getFileHandle(`${safeFileName}.txt`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();

        exportedCount++;

        // 更新进度
        if (exportedCount % 10 === 0) {
          showToast(`导出进度：${exportedCount}/${articles.length}`);
        }
      } catch (e) {
        console.error(`导出文章失败: ${art.title}`, e);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    showToast(`已完成导出 ${exportedCount} 篇文章`);
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('已取消导出');
    } else {
      console.error('导出失败:', err);
      // 降级方案
      fallbackExportSingle(accountName, articles);
    }
  }
}

// 单账号降级导出方案
async function fallbackExportSingle(accountName, articles) {
  showToast('使用传统下载方式...');

  let exportedCount = 0;
  const safeAccountName = accountName.replace(/[<>:"/\\|?*]/g, '_');

  for (const art of articles) {
    try {
      const result = await fetchArticleContent(art.link);
      let finalTitle = result.title || art.title;
      if (finalTitle.startsWith('无标题')) {
        finalTitle = extractTimeFromContent(result.content) || finalTitle;
      }

      // 默认导出全量数据（包含统计信息、评论等）
      const text = generateFullExportContent(art, result.content);

      // 文件名格式：账号名_文章标题
      const filename = `${safeAccountName}_${finalTitle}`;
      downloadTextFile(filename, text);
      exportedCount++;

      if (exportedCount % 10 === 0) {
        showToast(`导出进度：${exportedCount}/${articles.length}`);
      }
    } catch (e) {
      console.error(`导出文章失败: ${art.title}`, e);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  showToast(`已完成导出 ${exportedCount} 篇文章`);
}

// 导出所有公众号缓存数据（使用文件夹结构）
async function exportAllCacheData() {
  const data = await chrome.storage.local.get(['articleCache']);
  const allCache = data.articleCache || {};
  const configs = accountConfigs || {};

  if (Object.keys(allCache).length === 0) {
    showToast('暂无缓存数据');
    return;
  }

  // 计算总文章数
  let totalArticles = 0;
  for (const fakeid of Object.keys(allCache)) {
    const articles = await loadArticleCache(fakeid);
    if (articles) totalArticles += articles.length;
  }

  if (totalArticles === 0) {
    showToast('暂无有效缓存数据');
    return;
  }

  // 确认导出
  if (!confirm(`即将导出 ${Object.keys(allCache).length} 个账号共 ${totalArticles} 篇文章，是否继续？`)) {
    return;
  }

  try {
    // 使用保存的目录或提示用户选择
    const dirHandle = await getOrCreateExportDir();

    let totalExported = 0;

    // 遍历每个账号
    for (const fakeid of Object.keys(allCache)) {
      const accountName = configs[fakeid]?.name || fakeid;
      const articles = await loadArticleCache(fakeid);

      if (!articles || articles.length === 0) continue;

      // 创建账号文件夹（清理非法文件名字符）
      const safeAccountName = accountName.replace(/[<>:"/\\|?*]/g, '_');
      const accountDirHandle = await dirHandle.getDirectoryHandle(safeAccountName, { create: true });

      showToast(`正在导出「${accountName}」...`);

      // 导出该账号的所有文章
      for (const art of articles) {
        try {
          const result = await fetchArticleContent(art.link);
          let finalTitle = result.title || art.title;
          if (finalTitle.startsWith('无标题')) {
            finalTitle = extractTimeFromContent(result.content) || finalTitle;
          }

          // 默认导出全量数据（包含统计信息、评论等）
          const text = generateFullExportContent(art, result.content);

          // 清理文件名
          const safeFileName = finalTitle.replace(/[<>:"/\\|?*]/g, '_');
          const fileHandle = await accountDirHandle.getFileHandle(`${safeFileName}.txt`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(text);
          await writable.close();

          totalExported++;
        } catch (e) {
          console.error(`导出文章失败: ${art.title}`, e);
        }

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    showToast(`已完成导出 ${totalExported} 篇文章`);
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('已取消导出');
    } else {
      console.error('导出失败:', err);
      // 降级方案：使用传统下载方式
      fallbackExport();
    }
  }
}

// 降级导出方案（当 File System Access API 不可用时）
async function fallbackExport() {
  showToast('使用传统下载方式...');

  const data = await chrome.storage.local.get(['articleCache']);
  const allCache = data.articleCache || {};
  const configs = accountConfigs || {};

  let totalExported = 0;

  for (const fakeid of Object.keys(allCache)) {
    const accountName = configs[fakeid]?.name || fakeid;
    const articles = await loadArticleCache(fakeid);

    if (!articles || articles.length === 0) continue;

    showToast(`正在导出「${accountName}」...`);

    for (const art of articles) {
      try {
        const result = await fetchArticleContent(art.link);
        let finalTitle = result.title || art.title;
        if (finalTitle.startsWith('无标题')) {
          finalTitle = extractTimeFromContent(result.content) || finalTitle;
        }

        // 默认导出全量数据（包含统计信息、评论等）
        const text = generateFullExportContent(art, result.content);

        // 文件名格式：账号名_文章标题
        const safeAccountName = accountName.replace(/[<>:"/\\|?*]/g, '_');
        const filename = `${safeAccountName}_${finalTitle}`;
        downloadTextFile(filename, text);

        totalExported++;
      } catch (e) {
        console.error(`导出文章失败: ${art.title}`, e);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  showToast(`已完成导出 ${totalExported} 篇文章`);
}

// 导出设置数据（JSON格式，用于跨设备导入）
async function exportSettingsData() {
  const exportStatsEl = document.getElementById('importStats');
  exportStatsEl.style.display = 'block';
  exportStatsEl.textContent = '正在准备导出...';

  try {
    // 获取所有需要导出的数据
    const data = await chrome.storage.local.get(['articleCache', 'dailyUpdateRecord', 'accountConfigs']);

    // 统计信息
    const cacheCount = Object.keys(data.articleCache || {}).length;
    const recordCount = Object.keys(data.dailyUpdateRecord || {}).length;
    const configCount = Object.keys(data.accountConfigs || {}).length;

    // 计算总文章数
    let totalArticles = 0;
    for (const cache of Object.values(data.articleCache || {})) {
      totalArticles += cache.data?.length || 0;
    }

    if (cacheCount === 0) {
      exportStatsEl.innerHTML = '<span style="color: #f44336;">暂无数据可导出</span>';
      return;
    }

    // 提取账号名称（不包含敏感配置如 key、pass_ticket）
    const accountNames = {};
    for (const [fakeid, config] of Object.entries(data.accountConfigs || {})) {
      accountNames[fakeid] = config.name || '';
    }

    // 构建导出数据
    const exportData = {
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      articleCache: data.articleCache || {},
      dailyUpdateRecord: data.dailyUpdateRecord || {},
      accountNames: accountNames
    };

    // 生成文件名（包含日期时间）
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    const filename = `wxass_backup_${dateStr}_${timeStr}.json`;

    // 下载文件
    downloadJsonFile(filename, exportData);

    exportStatsEl.innerHTML = `
      <span style="color: #52c41a;">导出成功！</span><br>
      账号数: ${cacheCount} 个，文章数: ${totalArticles} 篇
    `;

  } catch (e) {
    console.error('导出失败:', e);
    exportStatsEl.innerHTML = `<span style="color: #f44336;">导出失败: ${e.message}</span>`;
  }
}

// 导入缓存数据（增量合并、去重、新数据覆盖旧数据）
async function importCacheData(file) {
  const importStatsEl = document.getElementById('importStats');
  importStatsEl.style.display = 'block';
  importStatsEl.textContent = '正在读取文件...';

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // 验证数据格式
    if (!importData.version || !importData.articleCache) {
      importStatsEl.innerHTML = '<span style="color: #f44336;">数据格式错误，请确保导出的是本工具生成的数据文件</span>';
      return;
    }

    importStatsEl.textContent = '正在导入数据...';

    // 获取当前存储的数据
    const currentData = await chrome.storage.local.get(['articleCache', 'dailyUpdateRecord', 'accountConfigs']);
    const currentCache = currentData.articleCache || {};
    const currentUpdateRecords = currentData.dailyUpdateRecord || {};
    const currentConfigs = currentData.accountConfigs || {};

    // 统计变量
    let newAccounts = 0;
    let updatedAccounts = 0;
    let newArticles = 0;
    let updatedArticles = 0;

    // 合并 articleCache（增量合并、去重、新数据覆盖旧数据）
    for (const [fakeid, importedCache] of Object.entries(importData.articleCache)) {
      if (!currentCache[fakeid]) {
        // 新账号，直接添加
        currentCache[fakeid] = importedCache;
        newAccounts++;
        newArticles += importedCache.data?.length || 0;
      } else {
        // 已有账号，合并文章数据
        updatedAccounts++;
        const existingArticles = currentCache[fakeid].data || [];
        const importedArticles = importedCache.data || [];

        // 创建文章链接到文章的映射，用于快速查找
        const articleMap = new Map();
        existingArticles.forEach(art => {
          if (art.link) {
            articleMap.set(art.link, art);
          }
        });

        // 遍历导入的文章
        importedArticles.forEach(importedArt => {
          if (!importedArt.link) return;

          const existingArt = articleMap.get(importedArt.link);
          if (existingArt) {
            // 文章已存在，用新数据覆盖旧数据
            // 合并统计数据和评论
            const merged = {
              ...existingArt,
              // 新数据覆盖旧数据
              title: importedArt.title || existingArt.title,
              cover: importedArt.cover || existingArt.cover,
              create_time: importedArt.create_time || existingArt.create_time,
              // 统计数据优先使用新数据
              read_num: importedArt.read_num !== undefined ? importedArt.read_num : existingArt.read_num,
              like_num: importedArt.like_num !== undefined ? importedArt.like_num : existingArt.like_num,
              share_num: importedArt.share_num !== undefined ? importedArt.share_num : existingArt.share_num,
              star_num: importedArt.star_num !== undefined ? importedArt.star_num : existingArt.star_num,
              comment_count: importedArt.comment_count !== undefined ? importedArt.comment_count : existingArt.comment_count,
              // 评论数据：合并或使用新数据
              comments: importedArt.comments && importedArt.comments.length > 0 ? importedArt.comments : existingArt.comments,
              comment_id: importedArt.comment_id || existingArt.comment_id
            };
            articleMap.set(importedArt.link, merged);
            updatedArticles++;
          } else {
            // 新文章，添加到映射
            articleMap.set(importedArt.link, importedArt);
            newArticles++;
          }
        });

        // 更新缓存数据
        currentCache[fakeid].data = Array.from(articleMap.values());
        // 更新时间戳
        if (importedCache.timestamp > currentCache[fakeid].timestamp) {
          currentCache[fakeid].timestamp = importedCache.timestamp;
        }
      }
    }

    // 合并 dailyUpdateRecord
    if (importData.dailyUpdateRecord) {
      for (const [fakeid, record] of Object.entries(importData.dailyUpdateRecord)) {
        if (!currentUpdateRecords[fakeid]) {
          currentUpdateRecords[fakeid] = record;
        } else {
          // 如果导入的记录更新，则更新
          if (record.lastUpdateTime && (!currentUpdateRecords[fakeid].lastUpdateTime || record.lastUpdateTime > currentUpdateRecords[fakeid].lastUpdateTime)) {
            currentUpdateRecords[fakeid] = record;
          }
        }
      }
    }

    // 合并账号名称（仅名称，不包含敏感配置）
    if (importData.accountNames) {
      for (const [fakeid, name] of Object.entries(importData.accountNames)) {
        if (!currentConfigs[fakeid]) {
          currentConfigs[fakeid] = { name, key: '', pass_ticket: '', enableCache: true };
        } else if (!currentConfigs[fakeid].name) {
          currentConfigs[fakeid].name = name;
        }
      }
    }

    // 保存到存储
    await chrome.storage.local.set({
      articleCache: currentCache,
      dailyUpdateRecord: currentUpdateRecords,
      accountConfigs: currentConfigs
    });

    // 刷新显示
    await renderHomeCachedAccountsList();

    // 显示导入结果
    importStatsEl.innerHTML = `
      <span style="color: #52c41a;">导入成功！</span><br>
      新增账号: ${newAccounts} 个，更新账号: ${updatedAccounts} 个<br>
      新增文章: ${newArticles} 篇，更新文章: ${updatedArticles} 篇
    `;

  } catch (e) {
    console.error('导入失败:', e);
    importStatsEl.innerHTML = `<span style="color: #f44336;">导入失败: ${e.message}</span>`;
  }
}

// 下载JSON文件
function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 打开分析页面
async function openAnalysisPage(fakeid) {
  const data = await chrome.storage.local.get(['articleCache', 'accountConfigs']);
  const cache = data.articleCache?.[fakeid];
  const config = data.accountConfigs?.[fakeid];

  if (!cache || !cache.data || cache.data.length === 0) {
    showToast('该账号暂无缓存数据');
    return;
  }

  // 打开新标签页
  const analysisUrl = chrome.runtime.getURL('analysis.html') + '?fakeid=' + fakeid;
  chrome.tabs.create({ url: analysisUrl });
}

// 搜狗微信搜索文章
async function searchSogouArticle(page = 0) {
  const query = document.getElementById('searchInput').value.trim();
  if (!query && page === 0) return;

  if (page === 0) sogouSearchQuery = query;
  sogouSearchPage = page;

  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = '<div class="empty">搜索中...</div>';
  document.getElementById('pagination').style.display = 'none';

  try {
    const url = `https://weixin.sogou.com/weixin?query=${encodeURIComponent(sogouSearchQuery)}&_sug_type_=&s_from=input&_sug_=n&type=2&page=${page + 1}&ie=utf8`;
    const response = await chrome.runtime.sendMessage({ type: 'searchSogou', url });

    if (response.error) {
      resultsEl.innerHTML = '<div class="empty">搜索失败，请稍后重试</div>';
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(response.html, 'text/html');

    // 提取搜索结果统计 - 搜狗格式通常是"搜狗已为您找到约XXX条结果"
    const numsEl = doc.querySelector('.nums') || doc.querySelector('.mun');
    let totalText = numsEl?.textContent || '';
    const totalMatch = totalText.match(/约[^\d]*(\d[\d,]*)/);
    const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0;

    // 提取总页数
    const pageLinks = doc.querySelectorAll('#pagebar_container a, .p a');
    let maxPage = 1;
    pageLinks.forEach(link => {
      const pageNum = parseInt(link.textContent);
      if (!isNaN(pageNum) && pageNum > maxPage) maxPage = pageNum;
    });
    sogouTotalPages = Math.max(maxPage, 1);

    const newsBox = doc.querySelector('.news-box');
    if (!newsBox) {
      resultsEl.innerHTML = '<div class="empty">未找到相关文章</div>';
      return;
    }

    const items = newsBox.querySelectorAll('li');
    if (items.length === 0) {
      resultsEl.innerHTML = '<div class="empty">未找到相关文章</div>';
      return;
    }

    const articles = Array.from(items).map(item => {
      const titleEl = item.querySelector('h3 a') || item.querySelector('.txt-box h3 a');
      const imgEl = item.querySelector('img');
      const summaryEl = item.querySelector('.txt-info') || item.querySelector('p.txt-info');
      const accountEl = item.querySelector('.all-time-y2') || item.querySelector('.account');
      const timeScript = item.querySelector('.s2 script')?.textContent || item.querySelector('.s2')?.innerHTML || '';

      let link = titleEl?.getAttribute('href') || '';
      if (link && link.startsWith('/')) {
        link = 'https://weixin.sogou.com' + link;
      }
      let img = imgEl?.getAttribute('src') || '';
      if (img && !img.startsWith('http')) {
        img = img.startsWith('//') ? 'https:' + img : 'https://weixin.sogou.com' + img;
      }

      // 从script中提取时间戳并转换
      let time = '';
      const tsMatch = timeScript.match(/timeConvert\('(\d+)'\)/);
      if (tsMatch) {
        const ts = parseInt(tsMatch[1]) * 1000;
        const date = new Date(ts);
        time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }

      // 提取来源账号名称
      const sourceLink = accountEl?.querySelector('a');
      const source = sourceLink?.textContent?.trim() || accountEl?.textContent?.trim() || '';

      return {
        title: titleEl?.textContent?.trim() || '无标题',
        link,
        img,
        summary: summaryEl?.textContent?.trim() || '',
        source,
        time
      };
    }).filter(a => a.link);

    displaySogouArticles(articles, totalCount);
    updateSogouPagination();
  } catch (error) {
    resultsEl.innerHTML = '<div class="empty">搜索失败，请稍后重试</div>';
  }
}

// 更新搜狗搜索翻页
function updateSogouPagination() {
  const paginationEl = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');

  paginationEl.style.display = 'block';
  prevBtn.disabled = sogouSearchPage === 0;
  nextBtn.disabled = sogouSearchPage >= sogouTotalPages - 1;
  pageInfo.textContent = `第 ${sogouSearchPage + 1} / ${sogouTotalPages} 页`;

  prevBtn.onclick = () => searchSogouArticle(sogouSearchPage - 1);
  nextBtn.onclick = () => searchSogouArticle(sogouSearchPage + 1);
}

// 高亮搜索词
function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text;
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<span style="color: red;">$1</span>');
}

// 显示搜狗文章列表
function displaySogouArticles(articles, totalCount) {
  const resultsEl = document.getElementById('results');
  const statsHtml = totalCount > 0 ? `<div style="padding: 8px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee; margin-bottom: 8px;">找到约 ${totalCount} 条结果（最多展示100条）</div>` : '';
  resultsEl.innerHTML = statsHtml + articles.map(art => `
    <div class="account-item" style="display: flex; gap: 12px; align-items: flex-start; padding: 12px;">
      ${art.img ? `<img src="${art.img}" style="width: 120px; height: 80px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">` : ''}
      <div style="flex: 1; min-width: 0;">
        <div class="article-title" data-link="${art.link}" style="font-weight: 600; font-size: 15px; color: #05a; margin-bottom: 6px; line-height: 1.4;">${highlightKeyword(art.title, sogouSearchQuery)}</div>
        ${art.summary ? `<div style="font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${highlightKeyword(art.summary, sogouSearchQuery)}</div>` : ''}
        <div style="font-size: 12px; color: #999; display: flex; gap: 12px; align-items: center;">
          ${art.source ? `<span style="color: #07c160;">${art.source}</span>` : ''}
          ${art.time ? `<span>${art.time}</span>` : ''}
          <button class="copy-btn sogou-copy" data-link="${art.link}" style="margin-left: auto;">复制链接</button>
          <button class="copy-btn sogou-export" data-link="${art.link}" data-title="${art.title.replace(/"/g, '&quot;')}" style="background: #ff9800;">导出</button>
        </div>
      </div>
    </div>
  `).join('');

  resultsEl.querySelectorAll('.article-title').forEach(title => {
    title.addEventListener('click', () => {
      chrome.tabs.create({ url: title.dataset.link });
    });
  });

  resultsEl.querySelectorAll('.sogou-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.link);
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = '复制链接', 1000);
    });
  });

  resultsEl.querySelectorAll('.sogou-export').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const originalText = btn.textContent;
      btn.textContent = '导出中...';
      btn.disabled = true;

      try {
        // 通过background获取文章内容
        const response = await chrome.runtime.sendMessage({ type: 'fetchSogouArticle', url: btn.dataset.link });
        if (response?.content) {
          const title = response.title || btn.dataset.title || '无标题';
          downloadTextFile(title, `标题：${title}\n\n内容：${response.content}`);
          btn.textContent = '已导出';
        } else {
          btn.textContent = '导出失败';
        }
      } catch (err) {
        btn.textContent = '导出失败';
      }

      btn.disabled = false;
      setTimeout(() => btn.textContent = originalText, 2000);
    });
  });
}

// 打开设置模态框
async function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const data = await chrome.storage.local.get(['accountConfigs', 'enableEnhancedMode', 'globalUin']);
  accountConfigs = data.accountConfigs || {};
  globalUin = data.globalUin || '';
  document.getElementById('enableEnhanced').checked = data.enableEnhancedMode || false;
  document.getElementById('globalUin').value = globalUin;
  renderAccountsList();
  modal.style.display = 'flex';

  // 绑定搜索账号事件
  document.getElementById('searchAccountBtn').onclick = searchAccountForSettings;
  document.getElementById('searchAccountInput').onkeypress = (e) => {
    if (e.key === 'Enter') searchAccountForSettings();
  };

  // 绑定输入框清空按钮
  bindInputClearButtons();

  // 绑定导入导出按钮事件
  document.getElementById('exportAllDataBtn').onclick = exportSettingsData;
  document.getElementById('importDataBtn').onclick = () => {
    document.getElementById('importFileInput').click();
  };
  document.getElementById('importFileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      importCacheData(file);
      e.target.value = ''; // 清空文件选择，允许重复导入同一文件
    }
  };
}

// 绑定输入框清空按钮
function bindInputClearButtons() {
  document.querySelectorAll('.input-clear').forEach(btn => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (input) {
      // 移除旧的事件监听器，避免重复绑定
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);

      newInput.addEventListener('input', () => {
        btn.style.display = newInput.value ? 'block' : 'none';
      });

      // 重新获取清空按钮并绑定点击事件
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
          targetInput.value = '';
          newBtn.style.display = 'none';
          targetInput.focus();
        }
      });

      newBtn.style.display = newInput.value ? 'block' : 'none';
    }
  });
}

// 关闭设置模态框
function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
  document.getElementById('accountSearchResults').style.display = 'none';
  document.getElementById('searchAccountInput').value = '';
  // 移除闪烁效果
  document.querySelectorAll('.flash-warning').forEach(el => el.classList.remove('flash-warning'));
  // 同步外部缓存开关状态
  syncArticleCacheToggle();
}

// 同步外部缓存开关状态
function syncArticleCacheToggle() {
  if (currentFakeid && accountConfigs[currentFakeid]) {
    const cacheToggle = document.getElementById('articleCacheToggle');
    cacheToggle.checked = accountConfigs[currentFakeid].enableCache !== false;
  }
}

// 渲染账号配置列表
function renderAccountsList() {
  const container = document.getElementById('accountsList');
  const configs = Object.entries(accountConfigs);

  if (configs.length === 0) {
    container.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center; padding: 10px;">暂无配置，请添加公众号</div>';
    return;
  }

  container.innerHTML = configs.map(([fakeid, config]) => `
    <div class="account-config-item" data-fakeid="${fakeid}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; font-size: 13px;">${config.name || fakeid}</span>
        <div style="display: flex; gap: 4px;">
          <button class="delete-account-btn" data-fakeid="${fakeid}" style="background: #f44336; padding: 4px 8px; font-size: 11px;">删除</button>
          <button class="clear-account-btn" data-fakeid="${fakeid}" style="background: #ff9800; padding: 4px 8px; font-size: 11px;">清空</button>
        </div>
      </div>
      <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; color: #666; width: 70px;">key:</span>
        <input type="text" class="config-key" data-fakeid="${fakeid}" value="${config.key || ''}" style="flex: 1; padding: 4px 6px; font-size: 12px;">
      </div>
      <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; color: #666; width: 70px;">pass_ticket:</span>
        <input type="text" class="config-pass-ticket" data-fakeid="${fakeid}" value="${config.pass_ticket || ''}" style="flex: 1; padding: 4px 6px; font-size: 12px;">
      </div>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
        <input type="checkbox" class="config-cache" data-fakeid="${fakeid}" ${config.enableCache !== false ? 'checked' : ''} style="width: auto; margin: 0;">
        <span style="font-size: 12px;">启用数据缓存</span>
      </label>
    </div>
  `).join('');

  // 绑定删除按钮事件
  container.querySelectorAll('.delete-account-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      delete accountConfigs[btn.dataset.fakeid];
      renderAccountsList();
    });
  });

  // 绑定清空按钮事件
  container.querySelectorAll('.clear-account-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fakeid = btn.dataset.fakeid;
      const configItem = container.querySelector(`.account-config-item[data-fakeid="${fakeid}"]`);
      if (configItem) {
        configItem.querySelector('.config-key').value = '';
        configItem.querySelector('.config-pass-ticket').value = '';
      }
    });
  });
}

// 缓存账号列表分页状态（首页）
let homeCachedAccountsPage = 0;
const HOME_CACHED_ACCOUNTS_PER_PAGE = 3;
// 首页缓存账号文章排序状态
const homeArticleSortState = {}; // { fakeid: 'time' | 'read' | 'like' | 'share' | 'comment' }
// 首页缓存账号展开状态
const homeAccountExpandedState = {}; // { fakeid: true/false }

// 排序文章列表
function sortArticlesBy(articles, sortBy) {
  const sorted = [...articles];
  switch (sortBy) {
    case 'read':
      sorted.sort((a, b) => (b.read_num || 0) - (a.read_num || 0));
      break;
    case 'like':
      sorted.sort((a, b) => (b.like_num || 0) - (a.like_num || 0));
      break;
    case 'share':
      sorted.sort((a, b) => (b.share_num || 0) - (a.share_num || 0));
      break;
    case 'comment':
      sorted.sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0));
      break;
    default:
      sorted.sort((a, b) => (b.create_time || 0) - (a.create_time || 0));
  }
  return sorted;
}

// 渲染首页缓存账号列表
async function renderHomeCachedAccountsList() {
  const container = document.getElementById('homeCachedAccountsList');
  const section = document.getElementById('cachedAccountsSection');
  const data = await chrome.storage.local.get(['articleCache', 'accountConfigs', 'dailyUpdateRecord']);
  const allCache = data.articleCache || {};
  const configs = data.accountConfigs || {};
  const updateRecords = data.dailyUpdateRecord || {};

  // 按更新时间排序，最新的在前面
  const cachedAccounts = Object.entries(allCache)
    .filter(([_, cache]) => cache.data && cache.data.length > 0)
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  if (cachedAccounts.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const totalPages = Math.ceil(cachedAccounts.length / HOME_CACHED_ACCOUNTS_PER_PAGE);
  const startIdx = homeCachedAccountsPage * HOME_CACHED_ACCOUNTS_PER_PAGE;
  const pageAccounts = cachedAccounts.slice(startIdx, startIdx + HOME_CACHED_ACCOUNTS_PER_PAGE);

  const calcStats = (articles) => {
    let totalRead = 0, totalLike = 0, totalShare = 0, totalComment = 0, withStats = 0;
    articles.forEach(a => {
      if (a.read_num !== undefined) {
        totalRead += a.read_num || 0;
        totalLike += a.like_num || 0;
        totalShare += a.share_num || 0;
        totalComment += a.comment_count || 0;
        withStats++;
      }
    });
    return { totalRead, totalLike, totalShare, totalComment, withStats };
  };

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${pageAccounts.map(([fakeid, cache]) => {
        const name = configs[fakeid]?.name || fakeid.slice(0, 8) + '...';
        let articles = cache.data || [];
        const stats = calcStats(articles);
        const currentSort = homeArticleSortState[fakeid] || 'time';
        const isExpanded = homeAccountExpandedState[fakeid] || false;
        // 检查今日是否已更新
        const updatedToday = updateRecords[fakeid]?.lastUpdateDate === getTodayDate();
        const updateTimeStr = updateRecords[fakeid]?.lastUpdateTime
          ? formatRelativeTime(updateRecords[fakeid].lastUpdateTime)
          : formatRelativeTime(cache.timestamp);
        // 应用排序
        articles = sortArticlesBy(articles, currentSort);
        return `
          <div class="cached-account-item" data-fakeid="${fakeid}" style="border: 1px solid #e0e0e0; border-radius: 4px; cursor: pointer; transition: background 0.2s;">
            <div class="cached-account-header" data-fakeid="${fakeid}" style="padding: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-weight: 600; font-size: 13px; color: #333;">${name}</span>
                  ${updatedToday ? '<span style="background: #52c41a; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px;">今日已更新</span>' : ''}
                  <span class="export-account-btn" data-fakeid="${fakeid}" title="导出该账号所有数据">📤</span>
                  <span class="analyze-account-btn" data-fakeid="${fakeid}" title="分析该账号数据">📊</span>
                </div>
                <span class="expand-btn" style="color: #1890ff; font-size: 10px;">${isExpanded ? '▲ 收起' : '▼ 展开文章'}</span>
              </div>
              <div style="color: #888; margin-top: 6px; font-size: 12px;">
                <span>📄 ${articles.length}篇</span>
                <span style="margin-left: 10px;">📊 ${stats.withStats}篇有数据</span>
                <span style="margin-left: 10px;">🕐 ${updateTimeStr}</span>
              </div>
              <div style="color: #666; margin-top: 4px; font-size: 12px;">
                👁 ${stats.totalRead.toLocaleString()} · 👍 ${stats.totalLike.toLocaleString()} · 🔗 ${stats.totalShare.toLocaleString()} · 💬 ${stats.totalComment.toLocaleString()}
              </div>
            </div>
            <div class="cached-articles-list" data-fakeid="${fakeid}" style="display: ${isExpanded ? 'block' : 'none'}; max-height: 250px; overflow-y: auto; border-top: 1px solid #eee; background: #fafafa;">
              <div class="article-sort-bar" style="padding: 6px 10px; border-bottom: 1px solid #eee; background: #f0f0f0; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; color: #666;">排序:</span>
                <select class="article-sort-select" data-fakeid="${fakeid}" style="padding: 2px 6px; font-size: 11px; border: 1px solid #ddd; border-radius: 3px;">
                  <option value="time" ${currentSort === 'time' ? 'selected' : ''}>按时间</option>
                  <option value="read" ${currentSort === 'read' ? 'selected' : ''}>按阅读</option>
                  <option value="like" ${currentSort === 'like' ? 'selected' : ''}>按点赞</option>
                  <option value="share" ${currentSort === 'share' ? 'selected' : ''}>按分享</option>
                  <option value="comment" ${currentSort === 'comment' ? 'selected' : ''}>按评论</option>
                </select>
              </div>
              <div class="articles-container" data-fakeid="${fakeid}">
                ${articles.slice(0, 20).map((a, i) => {
                  const hasComments = a.comment_count !== undefined && a.comment_count > 0;
                  return `
                    <div class="home-article-item" data-link="${a.link}" style="padding: 8px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer;" ${i % 2 ? 'background: #fff;' : ''}>
                      <div class="article-title-area" style="font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${a.title}">${a.title}</div>
                      <div style="font-size: 11px; color: #999; margin-top: 2px;">
                        ${a.read_num !== undefined ? `<span class="stat-read">👁${a.read_num.toLocaleString()}</span> <span class="stat-like">👍${(a.like_num||0).toLocaleString()}</span> <span class="stat-share">🔗${(a.share_num||0).toLocaleString()}</span>` : '暂无数据'}
                        ${hasComments ? `<span class="stat-comment" data-link="${a.link}" style="color: #4caf50; cursor: pointer; margin-left: 4px;">💬${a.comment_count}</span>` : ''}
                        <span style="margin-left: 8px;">${new Date(a.create_time * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
                ${articles.length > 20 ? `<div class="load-more-articles" data-fakeid="${fakeid}" data-offset="20" data-total="${articles.length}" style="padding: 8px; text-align: center; color: #1890ff; font-size: 11px; cursor: pointer;">向下滚动加载更多 (${articles.length - 20} 篇)</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${totalPages > 1 ? `
      <div style="display: flex; justify-content: center; gap: 8px; margin-top: 8px;">
        <button class="home-cached-page-btn" data-dir="prev" style="padding: 4px 12px; font-size: 12px; background: #f0f0f0;" ${homeCachedAccountsPage === 0 ? 'disabled' : ''}>上一页</button>
        <span style="font-size: 12px; color: #666; display: flex; align-items: center;">${homeCachedAccountsPage + 1} / ${totalPages}</span>
        <button class="home-cached-page-btn" data-dir="next" style="padding: 4px 12px; font-size: 12px; background: #f0f0f0;" ${homeCachedAccountsPage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
      </div>
    ` : ''}
  `;

  // 绑定展开/收起事件
  container.querySelectorAll('.cached-account-header').forEach(header => {
    header.addEventListener('click', () => {
      const fakeid = header.dataset.fakeid;
      const list = container.querySelector(`.cached-articles-list[data-fakeid="${fakeid}"]`);
      const btn = header.querySelector('.expand-btn');
      if (list.style.display === 'none') {
        list.style.display = 'block';
        btn.textContent = '▲ 收起';
        homeAccountExpandedState[fakeid] = true;
      } else {
        list.style.display = 'none';
        btn.textContent = '▼ 展开文章';
        homeAccountExpandedState[fakeid] = false;
      }
    });
  });

  // 绑定分页事件
  container.querySelectorAll('.home-cached-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dir === 'prev' && homeCachedAccountsPage > 0) {
        homeCachedAccountsPage--;
      } else if (btn.dataset.dir === 'next') {
        homeCachedAccountsPage++;
      }
      renderHomeCachedAccountsList();
    });
  });

  // 双击加载该账号的所有文章到文章视图
  container.querySelectorAll('.cached-account-item').forEach(item => {
    item.addEventListener('dblclick', () => {
      const fakeid = item.dataset.fakeid;
      loadArticles(fakeid, 0, false);
    });
  });

  // 绑定导出按钮事件
  container.querySelectorAll('.export-account-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fakeid = btn.dataset.fakeid;
      exportSingleAccountData(fakeid);
    });
  });

  // 绑定分析按钮事件
  container.querySelectorAll('.analyze-account-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fakeid = btn.dataset.fakeid;
      openAnalysisPage(fakeid);
    });
  });

  // 绑定排序选择器事件
  container.querySelectorAll('.article-sort-select').forEach(select => {
    select.addEventListener('change', (e) => {
      e.stopPropagation();
      const fakeid = select.dataset.fakeid;
      const newSort = select.value;
      homeArticleSortState[fakeid] = newSort;
      renderHomeCachedAccountsList();
    });
  });

  // 绑定文章点击和评论点击事件
  container.querySelectorAll('.home-article-item').forEach(item => {
    const link = item.dataset.link;
    const commentBtn = item.querySelector('.stat-comment');

    // 点击文章打开链接
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('stat-comment')) return;
      window.open(link, '_blank');
    });

    // 点击评论显示评论
    if (commentBtn) {
      commentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showCommentsModal(link);
      });
    }
  });

  // 加载更多文章按钮
  container.querySelectorAll('.load-more-articles').forEach(loadBtn => {
    loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fakeid = loadBtn.dataset.fakeid;
      const offset = parseInt(loadBtn.dataset.offset);
      const total = parseInt(loadBtn.dataset.total);
      const articlesContainer = container.querySelector(`.articles-container[data-fakeid="${fakeid}"]`);

      // 获取缓存中的文章数据并排序
      chrome.storage.local.get(['articleCache'], (data) => {
        const allCache = data.articleCache || {};
        const cache = allCache[fakeid];
        if (!cache || !cache.data) return;

        const currentSort = homeArticleSortState[fakeid] || 'time';
        const sortedArticles = sortArticlesBy(cache.data, currentSort);
        const nextBatch = sortedArticles.slice(offset, offset + 20);

        // 插入新文章
        const fragment = document.createDocumentFragment();
        nextBatch.forEach((a, i) => {
          const div = document.createElement('div');
          const actualIndex = offset + i;
          const hasComments = a.comment_count !== undefined && a.comment_count > 0;
          div.className = 'home-article-item';
          div.dataset.link = a.link;
          div.style.cssText = `padding: 8px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer; ${actualIndex % 2 ? 'background: #fff;' : ''}`;
          div.innerHTML = `
            <div style="font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${a.title}">${a.title}</div>
            <div style="font-size: 11px; color: #999; margin-top: 2px;">
              ${a.read_num !== undefined ? `<span class="stat-read">👁${a.read_num.toLocaleString()}</span> <span class="stat-like">👍${(a.like_num||0).toLocaleString()}</span> <span class="stat-share">🔗${(a.share_num||0).toLocaleString()}</span>` : '暂无数据'}
              ${hasComments ? `<span class="stat-comment" data-link="${a.link}" style="color: #4caf50; cursor: pointer; margin-left: 4px;">💬${a.comment_count}</span>` : ''}
              <span style="margin-left: 8px;">${new Date(a.create_time * 1000).toLocaleDateString()}</span>
            </div>
          `;
          // 点击文章打开链接
          div.addEventListener('click', (e) => {
            if (e.target.classList.contains('stat-comment')) return;
            window.open(a.link, '_blank');
          });
          // 点击评论显示评论
          const commentBtn = div.querySelector('.stat-comment');
          if (commentBtn) {
            commentBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              showCommentsModal(a.link);
            });
          }
          fragment.appendChild(div);
        });

        // 在加载按钮前插入
        articlesContainer.insertBefore(fragment, loadBtn);

        // 更新按钮状态
        const newOffset = offset + 20;
        const remaining = total - newOffset;

        if (remaining <= 0) {
          loadBtn.textContent = '已全部加载';
          loadBtn.style.cursor = 'default';
          loadBtn.style.color = '#999';
          loadBtn.onclick = null;
        } else {
          loadBtn.dataset.offset = newOffset;
          loadBtn.textContent = `向下滚动加载更多 (${remaining} 篇)`;
        }
      });
    });
  });

  // 滚动自动加载更多
  container.querySelectorAll('.cached-articles-list').forEach(list => {
    let isLoading = false;
    list.addEventListener('scroll', () => {
      if (isLoading) return;

      const loadBtn = list.querySelector('.load-more-articles');
      if (!loadBtn || loadBtn.textContent === '已全部加载') return;

      const scrollTop = list.scrollTop;
      const scrollHeight = list.scrollHeight;
      const clientHeight = list.clientHeight;

      // 当滚动到底部附近时自动加载
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        isLoading = true;
        loadBtn.click();
        setTimeout(() => { isLoading = false; }, 500);
      }
    });
  });
}

// 搜索账号（设置页面用）
async function searchAccountForSettings() {
  const query = document.getElementById('searchAccountInput').value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('accountSearchResults');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = '<div style="padding: 8px; color: #666; font-size: 12px;">搜索中...</div>';

  try {
    const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/searchbiz?action=search_biz&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&query=${encodeURIComponent(query)}&begin=0&count=5`, {
      headers: { 'Cookie': currentAuth.cookie }
    });
    const data = await response.json();

    if (data.base_resp?.ret === 0 && data.list?.length > 0) {
      resultsEl.innerHTML = data.list.map(acc => `
        <div class="search-result-item" data-fakeid="${acc.fakeid}" data-name="${acc.nickname}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <img src="${acc.round_head_img}" style="width: 30px; height: 30px; border-radius: 50%;">
          <span style="font-size: 13px;">${acc.nickname}</span>
        </div>
      `).join('');

      resultsEl.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const fakeid = item.dataset.fakeid;
          const name = item.dataset.name;
          if (!accountConfigs[fakeid]) {
            accountConfigs[fakeid] = { name, key: '', pass_ticket: '', enableCache: true };
            renderAccountsList();
          }
          resultsEl.style.display = 'none';
          document.getElementById('searchAccountInput').value = '';
          showToast(`已添加: ${name}`);
        });
      });
    } else {
      resultsEl.innerHTML = '<div style="padding: 8px; color: #999; font-size: 12px;">未找到结果</div>';
    }
  } catch (e) {
    resultsEl.innerHTML = '<div style="padding: 8px; color: #f44336; font-size: 12px;">搜索失败</div>';
  }
}

// 保存抓包参数
async function saveWxClientSettings() {
  const enabled = document.getElementById('enableEnhanced').checked;
  globalUin = document.getElementById('globalUin').value.trim();

  // 收集所有账号配置
  document.querySelectorAll('.account-config-item').forEach(item => {
    const fakeid = item.dataset.fakeid;
    if (accountConfigs[fakeid]) {
      let pass_ticket = item.querySelector('.config-pass-ticket').value.trim();
      if (pass_ticket.includes('%')) {
        try { pass_ticket = decodeURIComponent(pass_ticket); } catch (e) {}
      }
      accountConfigs[fakeid].key = item.querySelector('.config-key').value.trim();
      accountConfigs[fakeid].pass_ticket = pass_ticket;
      accountConfigs[fakeid].enableCache = item.querySelector('.config-cache').checked;
    }
  });

  enableEnhancedMode = enabled;
  await chrome.storage.local.set({ accountConfigs, enableEnhancedMode: enabled, globalUin });
  closeSettingsModal();
  showToast('保存成功');

  // 如果有限流状态，继续获取剩余文章
  console.log('[saveWxClientSettings] 检查限流状态, fakeid:', rateLimitedFakeid, 'queue:', rateLimitedQueue?.length);
  if (rateLimitedFakeid && rateLimitedQueue.length > 0) {
    console.log('[saveWxClientSettings] 有限流状态，500ms后继续获取');
    setTimeout(() => resumeRateLimitedFetch(), 500);
  }
}

// 加载抓包参数
async function loadWxClientSettings() {
  const data = await chrome.storage.local.get(['accountConfigs', 'enableEnhancedMode', 'globalUin']);
  accountConfigs = data.accountConfigs || {};
  enableEnhancedMode = data.enableEnhancedMode || false;
  globalUin = data.globalUin || '';
}

// Toast 提示
function showToast(msg, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', duration);
}

// 显示评论模态框
async function showCommentsModal(link) {
  console.log('[showCommentsModal] 查找评论, link:', link);

  // 先从 enhancedArticlesList 查找
  let art = enhancedArticlesList.find(a => a.link === link);

  // 如果没找到，从缓存中查找
  if (!art) {
    console.log('[showCommentsModal] enhancedArticlesList 中未找到，从缓存查找');
    const data = await chrome.storage.local.get(['articleCache']);
    const allCache = data.articleCache || {};
    for (const fakeid in allCache) {
      const cached = allCache[fakeid].data || [];
      const found = cached.find(a => a.link === link);
      if (found) {
        art = found;
        console.log('[showCommentsModal] 从缓存找到, fakeid:', fakeid, 'comment_count:', art.comment_count, 'comments:', art.comments);
        break;
      }
    }
  } else {
    console.log('[showCommentsModal] 从 enhancedArticlesList 找到, comment_count:', art.comment_count, 'comments:', art.comments);
  }

  const modal = document.getElementById('commentsModal');
  const content = document.getElementById('commentsContent');

  if (!art || !art.comments || art.comments.length === 0) {
    console.log('[showCommentsModal] 暂无评论, art:', !!art, 'comments:', art?.comments?.length);
    content.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无评论</div>';
  } else {
    console.log('[showCommentsModal] 显示评论, 数量:', art.comments.length);
    content.innerHTML = art.comments.map(c => `
      <div style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <img src="${c.logo_url || ''}" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">
          <span style="font-weight: 500; font-size: 14px;">${c.nick_name || '匿名'}</span>
          <span style="margin-left: auto; font-size: 12px; color: #999;">${c.create_time ? new Date(c.create_time * 1000).toLocaleString() : ''}</span>
        </div>
        <div style="font-size: 14px; line-height: 1.6; color: #333;">${c.content || ''}</div>
        <div style="margin-top: 6px; font-size: 12px; color: #999;">👍 ${c.like_num || 0}</div>
        ${c.reply && c.reply.reply_list && c.reply.reply_list.length > 0 ? `
          <div style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">作者回复:</div>
            <div style="font-size: 13px; color: #333;">${c.reply.reply_list[0].content || ''}</div>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  modal.style.display = 'flex';
}

// 关闭评论模态框
document.getElementById('closeCommentsBtn')?.addEventListener('click', () => {
  document.getElementById('commentsModal').style.display = 'none';
});
document.getElementById('commentsModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'commentsModal') {
    document.getElementById('commentsModal').style.display = 'none';
  }
});
document.getElementById('commentsModal')?.addEventListener('dblclick', (e) => {
  if (e.target.id === 'commentsModal') {
    document.getElementById('commentsModal').style.display = 'none';
  }
});

// 刷新文章列表
async function refreshArticles() {
  if (!currentFakeid) {
    showToast('请先选择公众号');
    return;
  }
  showToast('正在刷新...');
  // 重新加载配置
  await loadWxClientSettings();
  // 根据缓存开关决定是否强制刷新：缓存开关勾选则读取缓存，不勾选则强制刷新
  const accountConfig = accountConfigs[currentFakeid];
  const forceRefresh = !(accountConfig && accountConfig.enableCache !== false);
  await loadArticles(currentFakeid, 0, forceRefresh);
}

// 切换文章缓存开关
async function toggleArticleCache() {
  if (!currentFakeid || !accountConfigs[currentFakeid]) return;
  const checked = document.getElementById('articleCacheToggle').checked;
  accountConfigs[currentFakeid].enableCache = checked;
  await chrome.storage.local.set({ accountConfigs });
  showToast(checked ? '已启用缓存' : '已禁用缓存');
}

// 搜索历史相关
const MAX_SEARCH_HISTORY = 10;

async function saveSearchHistory() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;
  const data = await chrome.storage.local.get(['searchHistory']);
  let history = data.searchHistory || [];
  history = history.filter(h => h !== query);
  history.unshift(query);
  if (history.length > MAX_SEARCH_HISTORY) history = history.slice(0, MAX_SEARCH_HISTORY);
  await chrome.storage.local.set({ searchHistory: history });
}

async function showSearchHistory() {
  const data = await chrome.storage.local.get(['searchHistory']);
  const history = data.searchHistory || [];
  const historyEl = document.getElementById('searchHistory');
  if (history.length === 0) {
    historyEl.style.display = 'none';
    return;
  }
  historyEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #f5f5f5; border-bottom: 1px solid #eee;">
      <span style="font-size: 12px; color: #999;">搜索历史</span>
      <span id="clearAllHistory" style="font-size: 12px; color: #f44336; cursor: pointer;">清空</span>
    </div>
    ${history.map((h, i) => `
      <div class="history-item" data-index="${i}" style="display: flex; align-items: center; padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${h}</span>
        <span class="delete-history" data-index="${i}" style="color: #999; font-size: 14px; padding: 0 4px; margin-left: 8px;">×</span>
      </div>
    `).join('')}
  `;
  historyEl.style.display = 'block';

  document.getElementById('clearAllHistory')?.addEventListener('mousedown', async (e) => {
    e.stopPropagation();
    await chrome.storage.local.set({ searchHistory: [] });
    historyEl.style.display = 'none';
  });

  historyEl.querySelectorAll('.delete-history').forEach(btn => {
    btn.addEventListener('mousedown', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const newHistory = history.filter((_, i) => i !== idx);
      await chrome.storage.local.set({ searchHistory: newHistory });
      showSearchHistory();
    });
  });

  historyEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('delete-history')) return;
      const query = history[parseInt(item.dataset.index)];
      document.getElementById('searchInput').value = query;
      document.getElementById('clearBtn').style.display = 'block';
      historyEl.style.display = 'none';
      searchAccount(0);
    });
  });
}

// 获取当前账号的配置（包含通用uin）
function getCurrentAccountConfig() {
  const config = accountConfigs[currentFakeid];
  if (config) {
    return { ...config, uin: globalUin };
  }
  return null;
}

// 排序文章
async function sortArticles() {
  if (enhancedArticlesList.length === 0) return;

  // 如果正在加载阅读量，等待加载完成
  if (isLoadingStats) {
    const statusEl = document.getElementById('loadingStatus');
    if (statusEl) statusEl.textContent = '等待阅读量加载完成...';
    while (isLoadingStats) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const sortBy = document.getElementById('sortBy').value;
  const sorted = [...enhancedArticlesList];

  if (sortBy === 'read') {
    sorted.sort((a, b) => (b.read_num || 0) - (a.read_num || 0));
  } else if (sortBy === 'like') {
    sorted.sort((a, b) => (b.like_num || 0) - (a.like_num || 0));
  } else if (sortBy === 'share') {
    sorted.sort((a, b) => (b.share_num || 0) - (a.share_num || 0));
  } else if (sortBy === 'star') {
    sorted.sort((a, b) => (b.star_num || 0) - (a.star_num || 0));
  } else if (sortBy === 'comment') {
    sorted.sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0));
  } else {
    sorted.sort((a, b) => (b.create_time || 0) - (a.create_time || 0));
  }

  displayEnhancedArticles(sorted);
}

// ============= 导出路径管理（使用 IndexedDB 存储文件夹句柄）============

// 打开 IndexedDB 数据库
function openExportPathDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ExportPathDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('paths')) {
        db.createObjectStore('paths');
      }
    };
  });
}

// 保存导出路径句柄到 IndexedDB
async function saveExportPathHandle(handle) {
  const db = await openExportPathDB();
  const tx = db.transaction('paths', 'readwrite');
  const store = tx.objectStore('paths');
  store.put(handle, 'default');

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// 从 IndexedDB 获取导出路径句柄
async function getExportPathHandle() {
  const db = await openExportPathDB();
  const tx = db.transaction('paths', 'readonly');
  const store = tx.objectStore('paths');
  const request = store.get('default');

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// 删除导出路径句柄
async function deleteExportPathHandle() {
  const db = await openExportPathDB();
  const tx = db.transaction('paths', 'readwrite');
  const store = tx.objectStore('paths');
  store.delete('default');

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// 获取或创建导出目录
async function getOrCreateExportDir() {
  // 尝试从 IndexedDB 获取已保存的句柄
  let dirHandle = await getExportPathHandle().catch(() => null);

  if (dirHandle) {
    // 验证句柄是否仍然有效
    try {
      // 尝试访问目录以验证权限
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        return dirHandle;
      }
      // 请求权限
      const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (newPermission === 'granted') {
        return dirHandle;
      }
    } catch (e) {
      // 句柄无效，清除并重新选择
      await deleteExportPathHandle();
    }
  }

  // 没有保存的句柄或权限被拒绝，提示用户选择
  try {
    dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });

    // 保存新选择的句柄
    await saveExportPathHandle(dirHandle);

    // 更新显示
    await updateExportPathDisplay(dirHandle);

    return dirHandle;
  } catch (err) {
    if (err.name === 'AbortError') {
      const abortErr = new Error('用户取消了文件夹选择');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw err;
  }
}

// 选择导出路径
async function selectExportPath() {
  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });

    await saveExportPathHandle(dirHandle);
    await updateExportPathDisplay(dirHandle);
    showToast('导出路径已保存');
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('选择文件夹失败:', err);
      showToast('选择文件夹失败: ' + err.message);
    }
  }
}

// 清除导出路径
async function clearExportPath() {
  try {
    await deleteExportPathHandle();
    document.getElementById('exportPathDisplay').value = '';
    showToast('导出路径已清除');
  } catch (err) {
    console.error('清除路径失败:', err);
    showToast('清除路径失败');
  }
}

// 更新导出路径显示
async function updateExportPathDisplay(dirHandle) {
  const display = document.getElementById('exportPathDisplay');
  if (dirHandle) {
    display.value = dirHandle.name;
  } else {
    display.value = '';
  }
}

// 加载导出路径显示
async function loadExportPathDisplay() {
  try {
    const dirHandle = await getExportPathHandle().catch(() => null);
    if (dirHandle) {
      // 验证权限
      try {
        const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          // 尝试重新请求权限
          const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' });
          if (newPermission !== 'granted') {
            await deleteExportPathHandle();
            return;
          }
        }
        await updateExportPathDisplay(dirHandle);
      } catch (e) {
        // 句柄无效，清除
        await deleteExportPathHandle();
      }
    }
  } catch (err) {
    console.error('加载导出路径失败:', err);
  }
}
