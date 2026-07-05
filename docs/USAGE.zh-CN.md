# 使用说明

[中文 README](../README.zh-CN.md) · [English](USAGE.md) · [隐私政策](../PRIVACY.zh-CN.md)

## 安装

### Chrome 应用商店

公开上架并通过审核后，会在这里加入商店直达链接。普通用户建议安装商店版本，以便 Chrome 自动更新。

源码和版本下载地址：

- [https://github.com/Throb7777/chatgpt2doc](https://github.com/Throb7777/chatgpt2doc)
- [https://github.com/Throb7777/chatgpt2doc/releases](https://github.com/Throb7777/chatgpt2doc/releases)

### 本地构建

1. 安装 Node.js 和 npm。
2. 在项目目录打开终端。
3. 运行：

   ```powershell
   npm ci
   npm run build:chrome
   ```

4. 打开 `chrome://extensions`。
5. 开启“开发者模式”。
6. 选择“加载已解压的扩展程序”。
7. 选择 `.output/chrome-mv3`。
8. 打开或刷新 `https://chatgpt.com/`。

Edge 用户运行 `npm run build:edge`，打开 `edge://extensions`，并加载 `.output/edge-mv3`。

## 导出

### 单条助手回复

把鼠标移到一条助手回复附近，点击该回复旁的 DOCX 或 PDF 图标。文件只包含这条回复。

### 完整对话

点击浮动胶囊中的 DOCX 或 PDF 图标。消息会按照页面中的可见顺序导出。

### 仅助手内容

点击齿轮打开设置，关闭“包含用户提示”，然后从浮动胶囊导出。用户问题会被省略，助手回复仍保持原顺序。

### 选中的消息

从浮动胶囊进入“选择消息”，勾选需要的消息，然后从底部操作栏导出。没有勾选消息时不能导出。

如果 ChatGPT 仍在生成回复，请先等生成结束再导出。

## 进度和警告

同一时间只运行一个导出任务。进度提示会显示内容收集、文档生成和下载阶段。你可以在文件下载前取消。成功提示会自动关闭。

默认情况下，正常导出只提示“已完成”。如果希望查看图片不可用、公式不支持、内容收集不完整或可见回退等细节，可以在设置中开启“显示导出诊断”。

出现回退不代表整个文件导出失败，只表示对应内容无法完整保留原来的结构。

## 输出说明

- 受支持的 Word 公式会保持原生可编辑。
- 不支持的公式会保留渲染图或文本回退，不会被静默删除。
- PDF 文字可搜索。
- 图片可读取和解码时会嵌入文档。
- 如果图片无法嵌入，导出会尽量保留来源链接或可见提示。

## 复制公式到 Microsoft Word

默认复制目标是 **Microsoft Word**，不需要安装 helper：

1. 在一条 ChatGPT 消息中选中文字和公式。
2. 按 `Ctrl+C`。
3. 正常粘贴到 Microsoft Word。

在受支持的 Windows Word 版本中，受支持的公式会变成可编辑的 Word 公式。选择“仅保留文本”粘贴时，公式结构会被主动去除。

## 复制可编辑公式到 WPS Writer

WPS 使用不同的本机剪贴板格式，因此可编辑 WPS 公式需要可选 Windows helper：

1. 按照 [WPS helper 说明](../native/wps-helper/README.md) 为当前扩展 ID 构建并安装 helper。
2. 打开 ChatGPT2Doc 设置。
3. 把“复制目标”改为 **WPS Office**。
4. Chrome 询问时允许可选 Native Messaging 权限。
5. 点击“重新检查”，直到 helper 状态显示可用。
6. 在一条 ChatGPT 消息中选择内容并按 `Ctrl+C`。
7. 粘贴到 WPS Writer。

DOCX 和 PDF 导出始终不依赖 helper。

## 设置

- **语言：**英文或简体中文。
- **文件名：**留空时使用对话标题和时间。
- **纸张：**A4 或 Letter。
- **文档主题：**浅色或深色。
- **代码样式：**跟随文档、浅色或深色。
- **包含用户提示：**决定整段对话导出时是否包含用户问题。
- **显示导出诊断：**显示详细警告和回退信息。
- **每条回复操作：**显示或隐藏助手回复旁的按钮。
- **复制目标：**Microsoft Word 或 WPS Office。
- **胶囊位置：**直接拖动浮动胶囊，位置会自动记住。

点击“重置设置”可以恢复默认值。所有偏好只保存在浏览器本地。

## 常见问题

- **页面上没有导出按钮：**刷新 ChatGPT，并确认扩展已获准在 `chatgpt.com` 上运行。
- **导出一直没有结束：**先等当前回复生成完成，然后取消并重试一次。
- **公式显示为回退内容：**开启导出诊断，检查对应公式的可见结果。
- **图片没有嵌入：**浏览器可能无法读取或解码图片来源；扩展会尽量保留链接或可见提示。
- **WPS helper 不可用：**确认设置中的扩展 ID，用该 ID 重新安装 helper，允许可选权限后再点“重新检查”。
- **Chrome 提示没有 manifest：**重新运行 `npm run build:chrome`，加载 `.output/chrome-mv3`，不要加载项目根目录。
