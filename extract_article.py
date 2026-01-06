import requests
from bs4 import BeautifulSoup
from typing import TypedDict

class Args(TypedDict):
    params: dict

class Output(TypedDict):
    title: str
    content: str

async def main(args: Args) -> Output:
    params = args['params']
    url = params['url']

    # 发送请求获取页面
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    response = requests.get(url, headers=headers, timeout=10)
    response.encoding = 'utf-8'

    # 解析 HTML
    soup = BeautifulSoup(response.text, 'html.parser')

    # 提取标题
    title = (soup.select_one('#activity-name') or
            soup.select_one('h1.rich_media_title'))
    title_text = title.get_text(strip=True) if title else ''

    # 提取正文
    content = soup.select_one('#js_content')
    content_text = content.get_text(strip=True) if content else ''

    ret: Output = {
        "title": title_text,
        "content": content_text
    }
    return ret
