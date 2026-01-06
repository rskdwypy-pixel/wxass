// 提取知乎文章内容
function extractZhihuContent() {
    console.log('[知乎助手] 开始提取内容');

    // 问答页面
    let title = document.querySelector('h1.QuestionHeader-title')?.innerText ||
                document.querySelector('.QuestionHeader-main .QuestionHeader-title')?.innerText || '';
    let content = document.querySelector('.RichContent-inner')?.innerText ||
                  document.querySelector('.RichText')?.innerText || '';

    // 专栏页面
    if (!title) {
        title = document.querySelector('.Post-Title')?.innerText ||
                document.querySelector('h1.Post-Title')?.innerText ||
                document.querySelector('.ArticleItem-title')?.innerText || '';
    }
    if (!content) {
        content = document.querySelector('.Post-RichTextContainer')?.innerText ||
                  document.querySelector('.Post-RichText')?.innerText ||
                  document.querySelector('.RichText-inner')?.innerText || '';
    }

    console.log('[知乎助手] 提取结果 - 标题:', title ? '成功' : '失败', '内容:', content ? '成功' : '失败');

    return {
        title: title.trim(),
        content: content.trim(),
        url: window.location.href
    };
}

// 添加复制按钮
function addCopyButton() {
    if (document.getElementById('zhihu-copy-btn')) {
        console.log('[知乎助手] 按钮已存在，跳过');
        return;
    }

    console.log('[知乎助手] 添加复制按钮');

    const btn = document.createElement('button');
    btn.id = 'zhihu-copy-btn';
    btn.textContent = '一键复制';
    btn.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 10px 20px; background: #0084ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';

    btn.onclick = () => {
        const article = extractZhihuContent();
        const text = `标题: ${article.title}\n\n${article.content}`;
        navigator.clipboard.writeText(text);

        // 保存到存储
        chrome.storage.local.get(['zhihuArticles'], (data) => {
            const articles = data.zhihuArticles || [];
            const exists = articles.find(a => a.url === article.url);
            if (!exists) {
                articles.push(article);
                chrome.storage.local.set({ zhihuArticles: articles });
            }
        });

        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '一键复制', 1000);
    };

    document.body.appendChild(btn);
    console.log('[知乎助手] 按钮添加成功');
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'extractZhihu') {
        const data = extractZhihuContent();
        sendResponse(data);
    }
    return true;
});

// 页面加载完成后添加按钮
function initButton() {
    const url = window.location.href;
    console.log('[知乎助手] 当前URL:', url);

    if (url.includes('zhihu.com/question/') || url.includes('zhuanlan.zhihu.com/p/')) {
        console.log('[知乎助手] URL匹配成功，3秒后添加按钮');
        setTimeout(() => {
            console.log('[知乎助手] 执行添加按钮');
            addCopyButton();
        }, 3000);
    } else {
        console.log('[知乎助手] URL不匹配，跳过');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initButton);
} else {
    initButton();
}

// 监听URL变化（知乎是单页应用）
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('[知乎助手] URL变化，重新初始化');
        initButton();
    }
}).observe(document, { subtree: true, childList: true });
