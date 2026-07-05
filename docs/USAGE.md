# Usage Guide / 使用说明

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## Install / 安装

The Chrome Web Store link will be added after review. For a local build:

1. Run `npm ci` and `npm run build:chrome`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select `.output/chrome-mv3`.
4. Refresh `https://chatgpt.com/`.

Chrome 应用商店审核通过后会补充直达链接。本地测试时，先运行 `npm ci` 和 `npm run build:chrome`，然后打开 `chrome://extensions`、开启开发者模式，并加载 `.output/chrome-mv3`。

## Export / 导出

- Buttons beside a response export that response only. / 回复旁按钮只导出该条回复。
- The floating tray exports the full conversation. / 浮动胶囊导出完整对话。
- Turn off **Include user prompts** for assistant-only output. / 关闭“包含用户提示”可只导出助手内容。
- Selection mode exports only checked messages. / 选择模式只导出勾选消息。
- Wait for streaming to finish before exporting. / 回复生成完毕后再导出。

Only one export runs at a time. The progress notice shows collection,
rendering, and download work. Cancellation stops the job without downloading a
partial file. Successful notices close automatically.

同一时间只运行一个导出任务。进度提示会显示收集、生成和下载状态；取消后不会下载残缺文件；成功提示会自动消失。

## Output / 输出说明

- Supported Word equations are native and editable.
- Unsupported equations remain visible through a rendered or text fallback.
- PDF text stays searchable; very unusual formulas may use visible fallback.
- Images are embedded when readable. Otherwise a source link or visible
  fallback is retained.
- Detailed warnings can be enabled in Settings.

- 受支持的 Word 公式会保持原生可编辑。
- 不支持的公式会保留渲染图或文本回退，不会被静默删除。
- PDF 文字可搜索，极少见的复杂公式可能使用可见回退。
- 图片可读取时会嵌入，否则保留来源链接或可见提示。
- 可在设置中开启详细警告。

## Copy formulas / 复制公式

Choose **Microsoft Word** for the browser-only rich clipboard path. Choose
**WPS Office** only after installing the optional Windows helper described in
[`native/wps-helper/README.md`](../native/wps-helper/README.md). DOCX/PDF export
does not depend on the helper.

选择 **Microsoft Word** 时直接使用浏览器富文本剪贴板。只有安装了 [`native/wps-helper/README.md`](../native/wps-helper/README.md) 中的可选 Windows helper 后，才需要选择 **WPS Office**。DOCX/PDF 导出不依赖 helper。

## Settings / 设置

Settings cover language, file name, A4 or Letter paper, document theme, code
style, prompt inclusion, diagnostics, and Word/WPS copy target. They are stored
only in browser-local extension storage.

设置包括语言、文件名、A4 或 Letter、文档主题、代码样式、是否包含用户提示、诊断显示和 Word/WPS 复制目标，全部只保存在浏览器本地。
