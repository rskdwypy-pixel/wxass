// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'saveAuth') {
    chrome.storage.local.set({
      token: message.token,
      cookie: message.cookie,
      lastUpdate: Date.now()
    });
  } else if (message.type === 'searchSogou') {
    fetch(message.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
      .then(res => res.text())
      .then(html => sendResponse({ html }))
      .catch(() => sendResponse({ error: true }));
    return true;
  } else if (message.type === 'fetchSogouArticle') {
    // 获取搜狗链接页面
    fetch(message.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow'
    })
      .then(res => res.text())
      .then(html => {
        // 尝试多种方式提取真实微信链接
        let realUrl = null;

        // 方式1: 处理分段拼接的URL (url += 'xxx'; url += 'yyy';)
        const concatMatch = html.match(/var\s+url\s*=\s*['"].*?['"];[\s\S]*?window\.location\.replace\(url\)/);
        if (concatMatch) {
          const urlParts = concatMatch[0].match(/url\s*\+=\s*['"]([^'"]+)['"]/g);
          if (urlParts) {
            realUrl = urlParts.map(p => p.match(/['"]([^'"]+)['"]/)[1]).join('');
          }
        }

        // 方式2: 从JavaScript变量中提取
        if (!realUrl) {
          const urlMatch1 = html.match(/var\s+url\s*=\s*["']([^"']+)["']/);
          const urlMatch2 = html.match(/url\s*[=:]\s*["']([^"']+mp\.weixin\.qq\.com[^"']+)["']/);
          const urlMatch3 = html.match(/href\s*=\s*["']([^"']*mp\.weixin\.qq\.com[^"']+)["']/);
          const urlMatch4 = html.match(/(https?:\/\/mp\.weixin\.qq\.com\/s[^\s"'<>]+)/);

          if (urlMatch1) realUrl = urlMatch1[1];
          else if (urlMatch2) realUrl = urlMatch2[1];
          else if (urlMatch3) realUrl = urlMatch3[1];
          else if (urlMatch4) realUrl = urlMatch4[1];
        }

        // 解码URL中的转义字符
        if (realUrl) {
          realUrl = realUrl.replace(/\\x26/g, '&').replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
        }

        // 如果页面本身就是微信文章页面
        if (!realUrl && html.includes('id="js_content"')) {
          const titleMatch = html.match(/<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/) ||
                            html.match(/<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
          let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

          const contentMatch = html.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<div class="rich_media_tool)/);
          let content = contentMatch ? contentMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';

          sendResponse({ title, content });
          return;
        }

        if (realUrl && realUrl.includes('mp.weixin.qq.com')) {
          // 获取真实微信文章内容
          fetch(realUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          })
            .then(res => res.text())
            .then(articleHtml => {
              const titleMatch = articleHtml.match(/<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/) ||
                                articleHtml.match(/<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
              let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

              const contentMatch = articleHtml.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<div class="rich_media_tool)/);
              let content = contentMatch ? contentMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';

              sendResponse({ title, content: content || '内容提取失败' });
            })
            .catch(() => sendResponse({ error: true, msg: 'fetch article failed' }));
        } else {
          sendResponse({ error: true, msg: 'no valid url found' });
        }
      })
      .catch(() => sendResponse({ error: true, msg: 'fetch sogou failed' }));
    return true;
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
  } else if (message.type === 'fetchProfileArticles') {
    // 获取公众号文章列表 (profile_ext)
    const { biz, uin, key, pass_ticket, offset } = message;
    const url = `https://mp.weixin.qq.com/mp/profile_ext?action=getmsg&__biz=${biz}&f=json&offset=${offset || 0}&count=10&is_ok=1&scene=124&uin=${uin}&key=${key}&pass_ticket=${pass_ticket}&wxtoken=&appmsg_token=&x5=0`;

    fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
      .then(res => res.json())
      .then(data => sendResponse(data))
      .catch(() => sendResponse({ error: true }));
    return true;
  } else if (message.type === 'fetchArticleStats') {
    // 获取文章阅读量 (getappmsgext)
    const { biz, uin, key, pass_ticket, mid, sn, idx } = message;
    const url = `https://mp.weixin.qq.com/mp/getappmsgext?f=json&mock=&fasttmplajax=1&uin=${uin}&key=${key}&pass_ticket=${encodeURIComponent(pass_ticket)}&__biz=${biz}`;

    const r = '0.' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
    const body = new URLSearchParams({
      r,
      __biz: biz,
      appmsg_type: '9',
      mid: mid || '',
      sn: sn || '',
      idx: idx || '1',
      scene: '38',
      title: '',
      ct: '',
      abtest_cookie: '',
      devicetype: 'Windows 10 x64',
      version: '63090b13',
      is_need_ticket: '0',
      is_need_ad: '0',
      is_need_reward: '0',
      both_ad: '0',
      reward_uin_count: '0',
      send_time: '',
      msg_daily_idx: '1',
      is_original: '0',
      is_only_read: '1',
      pass_ticket: pass_ticket,
      is_temp_url: '0',
      item_show_type: '0',
      tmp_version: '1',
      more_read_type: '0',
      appmsg_like_type: '2'
    });

    fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })
      .then(res => res.json())
      .then(data => sendResponse(data))
      .catch(() => sendResponse({ error: true }));
    return true;
  } else if (message.type === 'fetchArticleComments') {
    // 获取文章评论 (appmsg_comment)
    const { biz, uin, key, pass_ticket, mid, idx, comment_id } = message;
    const url = `https://mp.weixin.qq.com/mp/appmsg_comment?action=getcomment&__biz=${biz}&appmsgid=${mid}&idx=${idx || 1}&comment_id=${comment_id}&offset=0&limit=100&uin=${uin}&key=${key}&pass_ticket=${encodeURIComponent(pass_ticket)}&wxtoken=&devicetype=Windows+10&clientversion=62060833&appmsg_token=`;

    fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
      .then(res => res.json())
      .then(data => sendResponse(data))
      .catch(() => sendResponse({ error: true }));
    return true;
  } else if (message.type === 'fetchArticleHtml') {
    // 获取文章HTML以提取comment_id
    fetch(message.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
      .then(res => res.text())
      .then(html => {
        const commentIdMatch = html.match(/var\s+comment_id\s*=\s*['"]([^'"]+)['"]/);
        sendResponse({ comment_id: commentIdMatch ? commentIdMatch[1] : null });
      })
      .catch(() => sendResponse({ error: true }));
    return true;
  }
});

// 监听登录标签页
let loginTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'openLoginTab') {
    chrome.tabs.create({ url: message.url }, (tab) => {
      loginTabId = tab.id;
      sendResponse({ tabId: tab.id });
    });
    return true;
  }
});

// 监听标签页URL变化，检测登录成功
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === loginTabId && changeInfo.url) {
    const url = changeInfo.url;
    // 检测是否登录成功（URL包含token参数）
    if (url.includes('mp.weixin.qq.com') && url.includes('token=')) {
      const tokenMatch = url.match(/token=(\d+)/);
      if (tokenMatch) {
        // 获取cookie
        chrome.cookies.getAll({ domain: 'mp.weixin.qq.com' }, (cookies) => {
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          // 保存认证信息
          chrome.storage.local.set({
            token: tokenMatch[1],
            cookie: cookieStr,
            lastUpdate: Date.now()
          });
          // 关闭登录标签页
          chrome.tabs.remove(tabId);
          loginTabId = null;
        });
      }
    }
  }
});

// 点击插件图标时打开新标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});
