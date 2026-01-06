async function main({ params }) {
    const url = params.url;

    // 发送请求获取页面
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    const html = await response.text();

    // 提取标题
    const titleMatch = html.match(/<h1[^>]*id="activity-name"[^>]*>(.*?)<\/h1>/s) ||
                       html.match(/<h1[^>]*class="rich_media_title"[^>]*>(.*?)<\/h1>/s);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    // 提取正文
    const contentMatch = html.match(/<div[^>]*id="js_content"[^>]*>(.*?)<\/div>/s);
    const content = contentMatch ? contentMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    const ret = {
        title: title,
        content: content
    };

    return ret;
}
