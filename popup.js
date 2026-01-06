let currentAuth = null;
let currentFakeid = null;
let currentQuery = '';
let currentPage = 0;
let totalAccounts = 0;
let currentArticlePage = 0;
let totalArticles = 0;
let currentArticlesList = [];

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();

  // 如果已登录但没有用户信息，立即获取
  if (currentAuth.token && currentAuth.cookie && !currentAuth.userInfo) {
    fetchUserInfo().then(() => checkAuthStatus());
  }

  document.getElementById('refreshBtn').addEventListener('click', refreshAuth);
  document.getElementById('copyTokenBtn').addEventListener('click', copyToken);
  document.getElementById('copyCookieBtn').addEventListener('click', copyCookie);
  document.getElementById('extractZhihuBtn').addEventListener('click', extractZhihu);
  document.getElementById('copyAllArticlesBtn').addEventListener('click', copyAllArticles);
  document.getElementById('copyAllZhihuBtn').addEventListener('click', copyAllZhihu);
  document.getElementById('deleteAllArticlesBtn').addEventListener('click', deleteAllArticles);
  document.getElementById('deleteAllZhihuBtn').addEventListener('click', deleteAllZhihu);
  document.getElementById('searchBtn').addEventListener('click', () => searchAccount(0));
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchAccount(0);
  });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    document.getElementById('clearBtn').style.display = e.target.value ? 'block' : 'none';
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearBtn').style.display = 'none';
    document.getElementById('results').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
  });
  document.getElementById('backBtn').addEventListener('click', showSearchView);
  document.getElementById('exportCurrentBtn').addEventListener('click', exportCurrentArticles);
  document.getElementById('exportAllBtn').addEventListener('click', exportAllArticles);
  document.getElementById('prevBtn').addEventListener('click', () => searchAccount(currentPage - 1));
  document.getElementById('nextBtn').addEventListener('click', () => searchAccount(currentPage + 1));
  document.getElementById('prevArticleBtn').addEventListener('click', () => loadArticles(currentFakeid, currentArticlePage - 1));
  document.getElementById('nextArticleBtn').addEventListener('click', () => loadArticles(currentFakeid, currentArticlePage + 1));

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

  // 监听 storage 变化自动刷新列表
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.articles) loadWxArticles();
      if (changes.zhihuArticles) loadZhihuArticles();
    }
  });
});

// 检查认证状态
async function checkAuthStatus() {
  const data = await chrome.storage.local.get(['token', 'cookie', 'userInfo']);
  currentAuth = data;

  const userDisplay = document.getElementById('userDisplay');
  if (data.token && data.cookie) {
    if (data.userInfo) {
      userDisplay.innerHTML = `<img src="${data.userInfo.avatar}" class="user-avatar" alt=""><span style="font-size: 13px;">${data.userInfo.nickname}</span>`;
    } else {
      userDisplay.innerHTML = '<span style="font-size: 13px; color: #666;">已登录</span>';
    }
  } else {
    userDisplay.innerHTML = '<span style="font-size: 13px; color: #999;">未登录</span><button id="loginBtn" class="login-btn">去登录</button>';
    setTimeout(() => {
      document.getElementById('loginBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://mp.weixin.qq.com' });
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
    alert('请在微信公众平台页面使用此功能');
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
}

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

// 加载文章列表
async function loadArticles(fakeid, page = 0) {
  if (page === 0) currentFakeid = fakeid;
  currentArticlePage = page;
  showArticleView();

  const articlesEl = document.getElementById('articles');
  articlesEl.innerHTML = '<div class="empty">加载中...</div>';

  try {
    const begin = page * 10;
    const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${currentFakeid}&type=9&query=&begin=${begin}&count=10`, {
      headers: {
        'Cookie': currentAuth.cookie
      }
    });

    const data = await response.json();

    if (data.base_resp?.ret === 0 && data.app_msg_list?.length > 0) {
      totalArticles = data.app_msg_cnt || 999;
      currentArticlesList = data.app_msg_list;
      displayArticles(data.app_msg_list);
      updateArticlePagination();
    } else if (data.base_resp?.ret === 200013) {
      articlesEl.innerHTML = '<div class="empty">已限流</div>';
      document.getElementById('articlePagination').style.display = 'none';
    } else {
      articlesEl.innerHTML = '<div class="empty">暂无文章</div>';
      document.getElementById('articlePagination').style.display = 'none';
    }
  } catch (error) {
    articlesEl.innerHTML = '<div class="empty">加载失败</div>';
    document.getElementById('articlePagination').style.display = 'none';
  }
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
  document.getElementById('searchView').style.display = 'block';
  document.getElementById('articleView').style.display = 'none';
}

function showArticleView() {
  document.getElementById('searchView').style.display = 'none';
  document.getElementById('articleView').style.display = 'block';
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
        await chrome.storage.local.set({ articles });
        loadWxArticles();
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

// 导出当前页文章
async function exportCurrentArticles() {
  const btn = document.getElementById('exportCurrentBtn');
  btn.textContent = '导出中...';
  btn.disabled = true;

  for (const art of currentArticlesList) {
    const result = await fetchArticleContent(art.link);
    let finalTitle = result.title || art.title;
    if (finalTitle.startsWith('无标题')) {
      finalTitle = extractTimeFromContent(result.content) || finalTitle;
    }
    const text = `标题：${finalTitle}\n\n内容：${result.content}`;
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
  if (!confirm('将导出该账号的所有文章，可能需要较长时间，是否继续？')) {
    return;
  }

  const btn = document.getElementById('exportAllBtn');
  const originalText = btn.textContent;
  btn.textContent = '停止导出';
  btn.style.background = '#f44336';
  stopExport = false;

  // 点击停止
  const stopHandler = () => {
    stopExport = true;
    btn.textContent = '正在停止...';
    btn.disabled = true;
  };
  btn.onclick = stopHandler;

  let page = 0;
  let exportedCount = 0;

  try {
    while (!stopExport) {
      const begin = page * 5;
      console.log(`正在请求第 ${page + 1} 页，begin=${begin}`);

      const response = await fetch(`https://mp.weixin.qq.com/cgi-bin/appmsg?action=list_ex&token=${currentAuth.token}&lang=zh_CN&f=json&ajax=1&random=${Math.random()}&fakeid=${currentFakeid}&type=9&query=&begin=${begin}&count=5`, {
        headers: { 'Cookie': currentAuth.cookie }
      });

      const data = await response.json();
      console.log(`第 ${page + 1} 页响应:`, data.base_resp?.ret, `文章数: ${data.app_msg_list?.length}`, `总数: ${data.app_msg_cnt}`);

      if (data.base_resp?.ret === 0 && data.app_msg_list?.length > 0) {
        for (const art of data.app_msg_list) {
          if (stopExport) {
            console.log('用户停止导出');
            break;
          }

          const result = await fetchArticleContent(art.link);
          let finalTitle = result.title || art.title;
          if (finalTitle.startsWith('无标题')) {
            finalTitle = extractTimeFromContent(result.content) || finalTitle;
          }
          const text = `标题：${finalTitle}\n\n内容：${result.content}`;
          downloadTextFile(finalTitle, text);
          exportedCount++;
          btn.textContent = `停止 (${exportedCount})`;
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        }

        const shouldStop = stopExport || exportedCount >= data.app_msg_cnt || data.app_msg_list.length === 0;
        console.log(`检查是否继续: stopExport=${stopExport}, 实际已导出=${exportedCount}, 总数=${data.app_msg_cnt}, 本页文章数=${data.app_msg_list.length}, shouldStop=${shouldStop}`);

        if (shouldStop) {
          console.log('导出结束');
          break;
        }

        page++;
        console.log(`准备请求下一页，page=${page}, begin=${page * 5}，等待3秒...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log('没有更多文章或请求失败');
        break;
      }
    }
  } catch (e) {
    console.error('导出错误:', e);
    alert('导出失败，请重试');
  }

  btn.textContent = stopExport ? `已停止 (${exportedCount})` : '导出完成';
  btn.style.background = '';
  btn.disabled = false;
  btn.onclick = exportAllArticles;
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}
