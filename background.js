// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'saveAuth') {
    chrome.storage.local.set({
      token: message.token,
      cookie: message.cookie,
      lastUpdate: Date.now()
    });
  } else if (message.type === 'fetchArticle') {
    fetch(message.url)
      .then(res => res.text())
      .then(html => {
        // 提取标题
        const beforeContent = html.split(/<div[^>]*id="js_content"/)[0];
        const titleMatch = beforeContent.match(/<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/) ||
                          beforeContent.match(/<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);

        let title = '';
        if (titleMatch) {
          title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }

        // 如果没有标题，尝试从内容中提取时间
        if (!title) {
          const timeMatch = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            title = `${timeMatch[1]}年${timeMatch[2]}月${timeMatch[3]}日${timeMatch[4]}:${timeMatch[5]}随笔`;
          } else {
            title = `无标题_${Date.now()}`;
          }
        }

        // 如果没有标题，使用标签页方式
        if (title.startsWith('无标题_')) {
          sendResponse({ title: '', content: '', useTab: true });
        } else {
          // 提取内容
          const contentMatch = html.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*)<script[^>]*nonce=/);
          let content = contentMatch ? contentMatch[1].replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';

          // 移除页面底部的无关文本
          const cutoffIndex = content.indexOf('预览时标签不可点');
          if (cutoffIndex !== -1) {
            content = content.substring(0, cutoffIndex).trim();
          }

          sendResponse({ title, content });
        }
      })
      .catch(err => {
        console.error('Fetch error:', err);
        sendResponse({ title: '', content: '', useTab: true });
      });
    return true;
  }
});

// 点击插件图标时打开新标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});
