# 茂茂AI公众号仿写工具 - API接口文档

## 基础信息

**基础域名**: `https://mp.weixin.qq.com`

**认证方式**:
- Token: 通过URL参数传递
- Cookie: 通过HTTP Header传递

**通用错误处理**:
- 当 `base_resp.ret != 0` 时表示Token或Cookie失效，需要重新登录

---

## 1. 搜索公众号

### 接口描述
搜索微信公众号，支持按名称模糊搜索。

### 请求信息

**请求方法**: `GET`

**请求路径**: `/cgi-bin/searchbiz`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| action | String | 是 | 固定值: `search_biz` |
| begin | Integer | 是 | 起始位置，从0开始 |
| count | Integer | 是 | 返回数量，建议10-20 |
| query | String | 是 | 搜索关键词（需URL编码） |
| token | String | 是 | 用户Token |
| lang | String | 是 | 语言，固定值: `zh_CN` |
| f | String | 是 | 固定值: `json` |
| ajax | Integer | 是 | 固定值: `1` |

**请求头**:
```
Cookie: {用户Cookie}
```

**请求示例**:
```
GET /cgi-bin/searchbiz?action=search_biz&begin=0&count=10&query=%E8%85%BE%E8%AE%AF&token=YOUR_TOKEN&lang=zh_CN&f=json&ajax=1
Cookie: YOUR_COOKIE
```

### 响应信息

**响应格式**: JSON

**响应字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| base_resp | Object | 基础响应信息 |
| base_resp.ret | Integer | 返回码，0表示成功 |
| list | Array | 公众号列表 |
| list[].fakeid | String | 公众号唯一标识 |
| list[].nickname | String | 公众号名称 |
| list[].alias | String | 公众号微信号 |
| list[].round_head_img | String | 公众号头像URL |

**响应示例**:
```json
{
  "base_resp": {
    "ret": 0,
    "err_msg": "ok"
  },
  "list": [
    {
      "fakeid": "MzI1MjExNTA2MA==",
      "nickname": "腾讯科技",
      "alias": "qqtech",
      "round_head_img": "https://wx.qlogo.cn/..."
    }
  ],
  "total": 100
}
```

**错误响应**:
```json
{
  "base_resp": {
    "ret": -1,
    "err_msg": "token expired"
  }
}
```

---

## 2. 获取公众号文章列表

### 接口描述
获取指定公众号的已发布文章列表。

### 请求信息

**请求方法**: `GET`

**请求路径**: `/cgi-bin/appmsgpublish`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| sub | String | 是 | 固定值: `list` |
| search_field | String | 是 | 固定值: `null` |
| begin | Integer | 是 | 起始位置，从0开始 |
| count | Integer | 是 | 返回数量，建议100 |
| query | String | 是 | 搜索关键词，留空表示全部 |
| fakeid | String | 是 | 公众号fakeid（需URL编码） |
| type | String | 是 | 固定值: `101_1` |
| free_publish_type | Integer | 是 | 固定值: `1` |
| sub_action | String | 是 | 固定值: `list_ex` |
| token | String | 是 | 用户Token |
| lang | String | 是 | 语言，固定值: `zh_CN` |
| f | String | 是 | 固定值: `json` |
| ajax | Integer | 是 | 固定值: `1` |

**请求头**:
```
Cookie: {用户Cookie}
```

**请求示例**:
```
GET /cgi-bin/appmsgpublish?sub=list&search_field=null&begin=0&count=100&query=&fakeid=MzI1MjExNTA2MA%3D%3D&type=101_1&free_publish_type=1&sub_action=list_ex&token=YOUR_TOKEN&lang=zh_CN&f=json&ajax=1
Cookie: YOUR_COOKIE
```

### 响应信息

**响应格式**: JSON

**响应字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| base_resp | Object | 基础响应信息 |
| base_resp.ret | Integer | 返回码，0表示成功 |
| publish_page | String/Object | 发布页面信息（可能是JSON字符串） |
| publish_page.total_count | Integer | 文章总数 |
| publish_page.publish_list | Array | 文章发布列表 |
| publish_list[].publish_info | String/Object | 发布信息（可能是JSON字符串） |
| publish_info.appmsgex | Array | 文章列表 |
| appmsgex[].title | String | 文章标题 |
| appmsgex[].link | String | 文章链接 |
| appmsgex[].cover | String | 封面图片URL |
| publish_info.sent_info.time | Integer | 发布时间戳（秒） |

**响应示例**:
```json
{
  "base_resp": {
    "ret": 0
  },
  "publish_page": {
    "total_count": 500,
    "publish_list": [
      {
        "publish_info": {
          "appmsgex": [
            {
              "title": "文章标题",
              "link": "https://mp.weixin.qq.com/s/xxx",
              "cover": "https://mmbiz.qpic.cn/..."
            }
          ],
          "sent_info": {
            "time": 1704067200
          }
        }
      }
    ]
  }
}
```

**注意事项**:
- `publish_page` 和 `publish_info` 字段可能是JSON字符串，需要二次解析
- 文章阅读数需要通过其他接口获取

---

## 3. 获取文章内容

### 接口描述
获取指定文章的HTML内容并提取纯文本。

### 请求信息

**请求方法**: `GET`

**请求路径**: 文章链接（从文章列表接口获取）

**请求参数**: 无

**请求示例**:
```
GET https://mp.weixin.qq.com/s/xxxxx
```

### 响应信息

**响应格式**: HTML

**内容提取**:
- 提取 `<div class="rich_media_content">` 或 `id="js_content"` 区域的内容
- 移除所有HTML标签，只保留纯文本
- 清理多余的空白字符

**处理流程**:
1. 获取HTML页面
2. 定位内容区域
3. 提取HTML片段
4. 移除标签
5. 清理格式

---

## 4. 获取用户信息

### 接口描述
获取当前登录用户的个人信息。

### 请求信息

**请求方法**: `GET`

**请求路径**: `/cgi-bin/home`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| t | String | 是 | 固定值: `home/index` |
| lang | String | 是 | 语言，固定值: `zh_CN` |
| token | String | 是 | 用户Token |

**请求头**:
```
Cookie: {用户Cookie}
```

**请求示例**:
```
GET /cgi-bin/home?t=home/index&lang=zh_CN&token=YOUR_TOKEN
Cookie: YOUR_COOKIE
```

### 响应信息

**响应格式**: HTML

**内容提取**:
从HTML中提取以下字段（使用正则表达式）:
- `nick_name`: 用户昵称
- `head_img`: 用户头像URL

**提取规则**:
```
nick_name\s*[:=]\s*["']([^"']+)["']
head_img\s*[:=]\s*["']([^"']+)["']
```

---

## 数据模型

### Account（公众号）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| fakeid | String | 公众号唯一标识 |
| nickname | String | 公众号名称 |
| alias | String | 公众号微信号 |
| roundHeadImg | String | 公众号头像URL |

### Article（文章）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| title | String | 文章标题 |
| link | String | 文章链接 |
| cover | String | 封面图片URL |
| publishTime | Integer | 发布时间戳（秒） |
| readNum | Integer | 阅读数（默认0） |

---

## 错误码说明

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 0 | 成功 | 正常处理 |
| -1 | Token失效 | 重新登录 |
| 401 | 认证失败 | 检查Token和Cookie |
| 400 | 参数错误 | 检查请求参数 |

---

## 使用说明

### 1. 获取Token和Cookie
- 登录微信公众平台后台
- 从浏览器开发者工具中获取Token和Cookie
- Token通常在URL参数中
- Cookie在请求头中

### 2. 接口调用流程
```
1. 搜索公众号 -> 获取fakeid
2. 获取文章列表 -> 获取文章链接
3. 获取文章内容 -> 提取纯文本
```

### 3. 注意事项
- 所有接口都需要有效的Token和Cookie
- Token和Cookie有时效性，失效后需要重新获取
- 建议控制请求频率，避免被限流
- 部分响应字段可能是JSON字符串，需要二次解析

---

## 更新日志

**v1.0.0** (2026-01-02)
- 初始版本
- 包含4个核心接口
- 支持公众号搜索、文章获取、内容提取、用户信息获取
