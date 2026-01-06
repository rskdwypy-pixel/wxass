// 知乎页面使用客户端渲染，无法通过服务端请求直接获取内容
// 需要使用浏览器环境或无头浏览器（如 Puppeteer）来执行 JavaScript 后提取内容

// 如果在浏览器环境中（如浏览器插件的 content script），可以使用以下代码：
/*
async function main({ params }) {
    // 在浏览器环境中直接从 DOM 提取
    const title = document.querySelector('h1.QuestionHeader-title')?.innerText ||
                  document.querySelector('.QuestionHeader-main .QuestionHeader-title')?.innerText || '';

    const content = document.querySelector('.RichContent-inner')?.innerText ||
                    document.querySelector('.RichText')?.innerText || '';

    return {
        title: title.trim(),
        content: content.trim()
    };
}
*/

// 如果需要在 Node.js 环境中提取，需要使用 Puppeteer：
async function main({ params }) {
    // 注意：此方法需要安装 puppeteer
    // 知乎使用客户端渲染，fetch 无法获取动态内容
    // 建议使用浏览器插件的 content script 直接从 DOM 提取

    throw new Error('知乎页面需要在浏览器环境中提取，或使用 Puppeteer 等无头浏览器工具');
}
