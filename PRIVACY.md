# Privacy Policy

Effective date: 2026-07-04

ChatGPT2Doc processes ChatGPT conversation content locally in the
browser to create DOCX and PDF files.

## Data Collection

The extension does not collect, sell, transmit, or retain conversation text,
conversation titles, message identifiers, browsing history, generated files,
or error payloads on a developer-operated server. It has no account system,
analytics, telemetry, advertising, subscription, licensing, or remote
conversion service.

## Local Storage

The `storage` permission is used only for these export preferences:

- interface/document language;
- custom file name;
- A4 or Letter paper;
- include user prompts;
- light or dark document theme;
- document, light, or dark code style.
- conversation collection and copy-target preferences;
- floating-panel position and diagnostic-display preferences.

They are stored locally under `chatExport.settings.v2` and can be reset from
the settings dialog.

## Optional WPS Integration

If the user selects WPS Office copy compatibility, the extension requests the
optional `nativeMessaging` permission. It communicates only with the separately
installed local WPS helper to place a bounded DOCX/OMML package on the local
clipboard. The helper opens no network port and does not transmit document
content. Microsoft Word compatible copy remains available without the helper.

## Page Access

The extension runs only on `https://chatgpt.com/*`. It reads conversation DOM
content after a user invokes an export action. Processing and document
generation occur in the browser.

## Images And Network Requests

When a selected export contains an image URL, the extension may request that
image from its existing source so it can be embedded. The request omits
credentials and suppresses the page referrer. The image host can still observe
normal connection data such as the request URL and IP address. No conversation
text is added to the request by the extension.

If the browser, source server, CORS policy, size limit, or image decoder blocks
the image, the output preserves a link or visible fallback and reports a
warning. Bundled PDF fonts are read from the installed extension itself and
are exposed only to `chatgpt.com` as packaged extension resources.

## Downloads

Generated DOCX and PDF files are downloaded with browser Blob URLs initiated
by the user. The extension does not require the broad `downloads` permission.

## Changes

Any future change that adds data collection, a new permission, another host,
or an external service must update this policy before release.

## Contact

Privacy issues can be reported through the project's public issue tracker once
the repository is published. No remote repository is configured in this local
release-candidate workspace.

---

# 隐私政策

生效日期：2026-07-04

ChatGPT2Doc 在浏览器本地处理 ChatGPT 对话并生成 DOCX 和 PDF。扩展不向
开发者服务器收集、出售、传输或保存对话文本、标题、消息标识、浏览历史、导出
文件或错误内容，也不包含账号、分析、遥测、广告、订阅、许可或远程转换服务。

`storage` 权限仅保存语言、文件名、纸张、是否包含用户提示、文档主题、代码样式、
对话收集、复制目标、浮动面板位置和诊断显示等本地偏好。数据位于本地
`chatExport.settings.v2`，可在设置中重置。扩展只在 `https://chatgpt.com/*`
运行。

如果用户选择 WPS Office 复制兼容，扩展会请求可选 `nativeMessaging` 权限，并且
只与单独安装的本地 WPS helper 通信，用于把有界 DOCX/OMML 包写入本机剪贴板。
该 helper 不打开网络端口，也不会传输文档内容。Microsoft Word 兼容复制不需要
安装 helper。

导出包含远程图片时，扩展可能从图片原地址发起不携带凭据并抑制页面 referrer
的读取。图片主机仍可能看到正常的请求 URL 和 IP 地址；扩展不会在请求中加入
对话文本。读取失败时，输出保留链接或可见回退并显示警告。

PDF 所需字体从已安装扩展自身读取，只作为打包扩展资源暴露给 `chatgpt.com`。
