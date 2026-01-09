// 自动提取 Token 和 Cookie
function extractAuth() {
  const token = document.querySelector('input[name="token"]')?.value ||
                new URLSearchParams(window.location.search).get('token');

  if (token) {
    chrome.runtime.sendMessage({
      type: 'saveAuth',
      token: token,
      cookie: document.cookie
    });
  }
}

// 提取 fakeid (从 URL 中获取 __biz 参数)
function extractFakeid() {
  const urlParams = new URLSearchParams(window.location.search);
  const biz = urlParams.get('__biz');
  return biz || '';
}

// 提取发布时间
function extractPublishTime() {
  const publishTimeEl = document.querySelector('#publish_time');
  if (publishTimeEl) {
    return publishTimeEl.innerText.trim();
  }
  // 尝试从其他可能的位置获取
  const dateEl = document.querySelector('.rich_media_meta.rich_media_meta_text');
  if (dateEl) {
    return dateEl.innerText.trim();
  }
  return '';
}

// 提取账号名称
function extractAccountName() {
  const accountNameEl = document.querySelector('#js_name');
  if (accountNameEl) {
    return accountNameEl.innerText.trim();
  }
  return '';
}

// 提取地区
function extractRegion() {
  const regionEl = document.querySelector('#js_ip_wording');
  if (regionEl) {
    return regionEl.innerText.trim();
  }
  return '';
}

// 提取文章内容
function extractArticle() {
  const title = document.querySelector('#activity-name')?.innerText ||
                document.querySelector('h1.rich_media_title')?.innerText || '';
  const content = document.querySelector('#js_content')?.innerText || '';

  return {
    title: title.trim(),
    content: content.trim(),
    url: window.location.href,
    fakeid: extractFakeid(),
    accountName: extractAccountName(),
    publishTime: extractPublishTime(),
    region: extractRegion(),
    saveTime: Date.now()
  };
}

// 添加复制按钮
function addCopyButton() {
  if (document.getElementById('wx-copy-btn')) return;
  if (!document.body) return;

  const btn = document.createElement('button');
  btn.id = 'wx-copy-btn';
  btn.textContent = '一键复制';
  btn.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 99999; padding: 10px 20px; background: #07c160; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';

  btn.onclick = () => {
    const article = extractArticle();
    const text = `标题: ${article.title}\n\n${article.content}`;
    navigator.clipboard.writeText(text);

    // 保存到存储
    chrome.storage.local.get(['articles'], (data) => {
      const articles = data.articles || [];
      const exists = articles.find(a => a.url === article.url);
      if (!exists) {
        articles.push(article);
        chrome.storage.local.set({ articles });
      }
    });

    btn.textContent = '已复制';
    setTimeout(() => btn.textContent = '一键复制', 1000);
  };

  document.body.appendChild(btn);
  console.log('一键复制按钮已添加');
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'extractAuth') {
    extractAuth();
    sendResponse({ success: true });
  } else if (message.type === 'extractArticle') {
    const article = extractArticle();
    sendResponse(article);
  } else if (message.type === 'getContent') {
    const content = document.querySelector('#js_content')?.innerText || '';
    const publishTime = document.querySelector('#publish_time')?.innerText || '';
    sendResponse({ content: content.trim(), publishTime: publishTime.trim() });
  }
  return true;
});

// 页面加载完成后提取
function init() {
  console.log('Content script loaded, URL:', window.location.href);
  extractAuth();
  if (window.location.href.includes('mp.weixin.qq.com/s')) {
    console.log('Article page detected, adding button...');
    addCopyButton();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听页面变化
if (document.body) {
  const observer = new MutationObserver(() => {
    extractAuth();
    if (window.location.href.includes('mp.weixin.qq.com/s') && !document.getElementById('wx-copy-btn')) {
      addCopyButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
