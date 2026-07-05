# 隐私政策

生效日期：2026-07-04

[English](PRIVACY.md) · [中文 README](README.zh-CN.md)

ChatGPT2Doc 会在浏览器本地处理 ChatGPT 对话内容，用于生成 DOCX 和 PDF 文件。

## 数据收集

扩展不会把对话正文、对话标题、消息标识、浏览历史、生成文件或错误内容收集、出售、传输或保存在开发者服务器上。扩展没有账号系统、数据分析、遥测、广告、订阅、授权校验或远程转换服务。

## 本地存储

`storage` 权限只用于保存以下导出偏好：

- 界面和文档语言；
- 自定义文件名；
- A4 或 Letter 纸张；
- 是否包含用户提示；
- 浅色或深色文档主题；
- 文档、浅色或深色代码样式；
- 对话收集和复制目标偏好；
- 浮动胶囊位置和诊断显示偏好。

这些设置保存在浏览器本地的 `chatExport.settings.v2` 下，可以从设置面板中重置。

## 可选 WPS 集成

如果用户选择 WPS Office 复制兼容模式，扩展会请求可选的 `nativeMessaging` 权限。它只会与用户单独安装的本地 WPS helper 通信，把受限的 DOCX/OMML 包放到本机剪贴板。该 helper 不开放网络端口，也不会传输文档内容。Microsoft Word 兼容复制不需要 helper。

## 页面访问

扩展只在 `https://chatgpt.com/*` 上运行。用户主动触发导出后，扩展会读取页面中的对话 DOM 内容。解析和文档生成都在浏览器内完成。

## 图片和网络请求

当选中的导出内容包含图片 URL 时，扩展可能会从图片原地址读取该图片，以便嵌入文档。请求会省略凭据，并尽量抑制页面来源信息。如果图片无法读取或解码，导出会保留链接或可见回退提示。

扩展没有开发者后台接口，也不会把对话内容上传到开发者。

## 剪贴板

复制增强功能只在用户主动按 `Ctrl+C` 复制 ChatGPT 消息内容时运行。Microsoft Word 路径使用浏览器富文本剪贴板；WPS Office 路径在用户选择 WPS 并安装 helper 后使用本地 helper。剪贴板内容不会发送到开发者服务器。

## 权限

- `storage`：保存本地偏好。
- `https://chatgpt.com/*`：在 ChatGPT 页面显示导出控件，并在用户请求时读取对话内容。
- 可选 `nativeMessaging`：仅在用户选择 WPS Office 复制兼容模式时请求。

扩展不请求下载、身份、历史记录、Cookie、标签页、宽泛主机或远程代码权限。

## 联系方式

问题和反馈请使用 GitHub：

- [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- [https://github.com/Throb7777/chatgpt2doc/issues](https://github.com/Throb7777/chatgpt2doc/issues)
