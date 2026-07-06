import type { ExportFormat } from '../document/export';
import type { ExportLanguage } from '../document/export';
import type { WarningCode } from '../document/ast';
import type { ExportStage } from '../export/export-job';

export interface UiStrings {
  cancel: string;
  cancelExport: string;
  close: string;
  codeStyle: string;
  codeStyleDark: string;
  codeStyleDocument: string;
  codeStyleLight: string;
  collectionMode: string;
  collectionModeScanComplete: string;
  collectionModeVisibleOnly: string;
  contentSettings: string;
  conversation: string;
  copyExtensionId: string;
  copyTarget: string;
  copyTargetWord: string;
  copyTargetWordDescription: string;
  copyTargetWps: string;
  copyTargetWpsDescription: string;
  currentExtensionId: string;
  defaultScope: string;
  dragPanel: string;
  extensionIdCopied: string;
  export: string;
  exportCancelled: string;
  exportComplete: string;
  exportFailed(detail: string): string;
  exportProgress: Record<ExportStage, string>;
  exportProgressTitle: string;
  exportAs(target: string, format: ExportFormat): string;
  fileName: string;
  fileNamePlaceholder: string;
  includePrompts: string;
  interfaceSettings: string;
  language: string;
  panelCollapsed: string;
  paper: string;
  popupDescription: string;
  popupTitle: string;
  quickExport: string;
  recentCount: string;
  reset: string;
  resetPanelPosition: string;
  response: string;
  save: string;
  selectAtLeastOne: string;
  selectMessage(index: number): string;
  selectMessages: string;
  selectedCount(count: number): string;
  selecting: string;
  settings: string;
  settingsTitle: string;
  showExportDiagnostics: string;
  showPerMessageActions: string;
  scopeFullConversation: string;
  scopeRecentMessages: string;
  theme: string;
  themeDark: string;
  themeLight: string;
  warningAction: Record<WarningCode, string>;
  warningCount(count: number): string;
  warningsSummary(count: number): string;
  wpsCheckAgain: string;
  wpsCopyFallback: string;
  wpsCopyPreparing: string;
  wpsCopyReady: string;
  wpsDisable: string;
  wpsDownloadHelper: string;
  wpsEnable: string;
  wpsIntegration: string;
  wpsIntegrationDescription: string;
  wpsBoundExtensionIds: string;
  wpsBindingMatches: string;
  wpsBindingMismatch: string;
  wpsHelperInstallPath: string;
  wpsInstallHint: string;
  wpsRebindHint: string;
  wpsStatusChecking: string;
  wpsStatusDenied: string;
  wpsStatusHelperFailed: string;
  wpsStatusHostForbidden: string;
  wpsStatusHostNotFound: string;
  wpsStatusOff: string;
  wpsStatusPermissionNeeded: string;
  wpsStatusReady: string;
  wpsStatusUnavailable: string;
  wpsWordUnchanged: string;
}

const EN: UiStrings = {
  cancel: 'Cancel',
  cancelExport: 'Cancel export',
  close: 'Close',
  codeStyle: 'Code style',
  codeStyleDark: 'Dark',
  codeStyleDocument: 'Follow document',
  codeStyleLight: 'Light',
  collectionMode: 'Collection mode',
  collectionModeScanComplete: 'Complete scan',
  collectionModeVisibleOnly: 'Loaded messages only',
  contentSettings: 'Content',
  conversation: 'conversation',
  copyExtensionId: 'Copy ID',
  copyTarget: 'Copy compatibility',
  copyTargetWord: 'Word / Microsoft Office',
  copyTargetWordDescription: 'Recommended. No helper required; preserves formulas through Word-compatible HTML.',
  copyTargetWps: 'WPS Office',
  copyTargetWpsDescription: 'Uses the local helper for editable WPS equations. Falls back to Word-compatible copy when unavailable.',
  currentExtensionId: 'Current extension ID',
  defaultScope: 'Default scope',
  dragPanel: 'Drag export panel',
  extensionIdCopied: 'Copied',
  export: 'Export',
  exportCancelled: 'Export cancelled.',
  exportComplete: 'Completed.',
  exportFailed: (detail) => `Export failed: ${detail}`,
  exportProgress: {
    collecting: 'Collecting conversation…',
    downloading: 'Preparing download…',
    rendering: 'Rendering document…',
  },
  exportProgressTitle: 'Export progress',
  exportAs: (target, format) => `Export ${target} as ${format.toUpperCase()}`,
  fileName: 'File name',
  fileNamePlaceholder: 'Automatic from conversation title',
  includePrompts: 'Include user prompts',
  interfaceSettings: 'Interface',
  language: 'Language',
  panelCollapsed: 'Collapse floating panel',
  paper: 'Paper',
  popupDescription: 'Export ChatGPT conversations locally to DOCX and PDF.',
  popupTitle: 'ChatGPT2Doc',
  quickExport: 'Quick export',
  recentCount: 'Recent message count',
  reset: 'Reset',
  resetPanelPosition: 'Reset panel position',
  response: 'response',
  save: 'Save',
  selectAtLeastOne: 'Select at least one message to export.',
  selectMessage: (index) => `Select message ${index}`,
  selectMessages: 'Select messages',
  selectedCount: (count) => `${count} ${count === 1 ? 'message' : 'messages'} selected.`,
  selecting: 'Selecting',
  settings: 'Settings',
  settingsTitle: 'Export settings',
  showExportDiagnostics: 'Show export diagnostics',
  showPerMessageActions: 'Show per-message actions',
  scopeFullConversation: 'Conversation',
  scopeRecentMessages: 'Recent messages',
  theme: 'Document theme',
  themeDark: 'Dark',
  themeLight: 'Light',
  warningAction: {
    'image-unavailable': 'Open the source link when available and verify the image manually.',
    'incomplete-collection': 'Return to the conversation, load all messages, and export again.',
    'math-fallback': 'Review the visible fallback and simplify unsupported notation if needed.',
    'unsupported-content': 'Review the visible fallback for content that could not keep its structure.',
  },
  warningCount: (count) => `${count} occurrence${count === 1 ? '' : 's'}`,
  warningsSummary: (count) => `Export completed with ${count} warning${count === 1 ? '' : 's'}.`,
  wpsCheckAgain: 'Check again',
  wpsCopyFallback: 'WPS integration is unavailable. Word copy was preserved.',
  wpsCopyPreparing: 'Preparing editable WPS content…',
  wpsCopyReady: 'Ready to paste into WPS.',
  wpsDisable: 'Disable',
  wpsDownloadHelper: 'Download helper',
  wpsEnable: 'Enable WPS integration',
  wpsIntegration: 'WPS integration',
  wpsIntegrationDescription: 'Adds editable WPS formulas through the optional local helper.',
  wpsBoundExtensionIds: 'Helper-bound extension ID',
  wpsBindingMatches: 'Binding matches the current extension.',
  wpsBindingMismatch: 'Binding does not match the current extension. Re-run the installer with the current ID.',
  wpsHelperInstallPath: 'Helper install path',
  wpsInstallHint: 'Install the local helper, then check again.',
  wpsRebindHint: 'If the helper is already installed, re-run the installer for this extension ID.',
  wpsStatusChecking: 'Checking',
  wpsStatusDenied: 'Permission denied',
  wpsStatusHelperFailed: 'Helper failed',
  wpsStatusHostForbidden: 'Helper bound to another extension',
  wpsStatusHostNotFound: 'Helper not installed',
  wpsStatusOff: 'Off',
  wpsStatusPermissionNeeded: 'Permission required',
  wpsStatusReady: 'Ready',
  wpsStatusUnavailable: 'Helper unavailable',
  wpsWordUnchanged: 'Microsoft Word copy remains unchanged.',
};

const ZH_CN: UiStrings = {
  cancel: '取消',
  cancelExport: '取消导出',
  close: '关闭',
  codeStyle: '代码样式',
  codeStyleDark: '深色',
  codeStyleDocument: '跟随文档',
  codeStyleLight: '浅色',
  collectionMode: '\u6536\u96c6\u65b9\u5f0f',
  collectionModeScanComplete: '\u5b8c\u6574\u626b\u63cf',
  collectionModeVisibleOnly: '\u4ec5\u5df2\u52a0\u8f7d\u6d88\u606f',
  contentSettings: '\u5185\u5bb9',
  conversation: '对话',
  copyExtensionId: '复制 ID',
  copyTarget: '复制兼容模式',
  copyTargetWord: 'Word / Microsoft Office',
  copyTargetWordDescription: '推荐。不需要额外组件，通过 Word 兼容 HTML 保留公式。',
  copyTargetWps: 'WPS Office',
  copyTargetWpsDescription: '通过本地增强组件支持 WPS 可编辑公式；不可用时自动回退到 Word 兼容复制。',
  currentExtensionId: '当前扩展 ID',
  defaultScope: '\u9ed8\u8ba4\u8303\u56f4',
  dragPanel: '\u62d6\u52a8\u5bfc\u51fa\u9762\u677f',
  extensionIdCopied: '已复制',
  export: '导出',
  exportCancelled: '导出已取消。',
  exportComplete: '已完成',
  exportFailed: (detail) => `导出失败：${detail}`,
  exportProgress: {
    collecting: '正在收集对话…',
    downloading: '正在准备下载…',
    rendering: '正在生成文档…',
  },
  exportProgressTitle: '导出进度',
  exportAs: (target, format) => `将${target}导出为 ${format.toUpperCase()}`,
  fileName: '文件名',
  fileNamePlaceholder: '根据对话标题自动生成',
  includePrompts: '包含用户提示词',
  interfaceSettings: '\u754c\u9762',
  language: '语言',
  panelCollapsed: '\u6536\u8d77\u6d6e\u52a8\u9762\u677f',
  paper: '纸张',
  popupDescription: '在浏览器中将 ChatGPT 对话本地导出为 DOCX 和 PDF。',
  popupTitle: 'ChatGPT2Doc',
  quickExport: '\u5feb\u901f\u5bfc\u51fa',
  recentCount: '\u6700\u8fd1\u6d88\u606f\u6570',
  reset: '恢复默认',
  resetPanelPosition: '\u91cd\u7f6e\u9762\u677f\u4f4d\u7f6e',
  response: '回答',
  save: '保存',
  selectAtLeastOne: '请至少选择一条消息。',
  selectMessage: (index) => `选择第 ${index} 条消息`,
  selectMessages: '选择消息',
  selectedCount: (count) => `已选择 ${count} 条消息。`,
  selecting: '选择中',
  settings: '设置',
  settingsTitle: '导出设置',
  showExportDiagnostics: '显示导出诊断详情',
  showPerMessageActions: '\u663e\u793a\u6bcf\u6761\u56de\u7b54\u64cd\u4f5c',
  scopeFullConversation: '\u5bf9\u8bdd',
  scopeRecentMessages: '\u6700\u8fd1\u6d88\u606f',
  theme: '文档主题',
  themeDark: '深色',
  themeLight: '浅色',
  warningAction: {
    'image-unavailable': '如有来源链接，请打开链接并手动核对图片。',
    'incomplete-collection': '返回对话并加载全部消息，然后重新导出。',
    'math-fallback': '检查可见回退；如有需要，请简化不支持的公式写法。',
    'unsupported-content': '检查无法保留原结构的可见回退内容。',
  },
  warningCount: (count) => `${count} 处`,
  warningsSummary: (count) => `导出完成，共有 ${count} 条警告。`,
  wpsCheckAgain: '重新检查',
  wpsCopyFallback: 'WPS 集成不可用，已保留 Word 复制内容。',
  wpsCopyPreparing: '正在准备 WPS 可编辑内容…',
  wpsCopyReady: '已准备，可粘贴到 WPS。',
  wpsDisable: '停用',
  wpsDownloadHelper: '下载增强组件',
  wpsEnable: '启用 WPS 集成',
  wpsIntegration: 'WPS 集成',
  wpsIntegrationDescription: '通过可选本地 helper 增加 WPS 原生可编辑公式格式。',
  wpsBoundExtensionIds: '增强组件绑定的扩展 ID',
  wpsBindingMatches: '绑定信息与当前扩展一致。',
  wpsBindingMismatch: '绑定信息与当前扩展不一致，请使用当前 ID 重新运行安装器。',
  wpsHelperInstallPath: '增强组件安装路径',
  wpsInstallHint: '安装本地 helper 后重新检查。',
  wpsRebindHint: '如果已安装增强组件，请使用当前扩展 ID 重新运行安装器。',
  wpsStatusChecking: '检查中',
  wpsStatusDenied: '权限已拒绝',
  wpsStatusHelperFailed: '增强组件启动失败',
  wpsStatusHostForbidden: '增强组件绑定到其他扩展',
  wpsStatusHostNotFound: '未安装本地增强组件',
  wpsStatusOff: '未启用',
  wpsStatusPermissionNeeded: '需要启用本地增强权限',
  wpsStatusReady: '已就绪',
  wpsStatusUnavailable: '增强组件不可用',
  wpsWordUnchanged: 'Microsoft Word 复制路径保持不变。',
};

export const UI_STRING_KEYS = Object.keys(EN).sort();

export function getUiStrings(language: ExportLanguage): UiStrings {
  return language === 'zh-CN' ? ZH_CN : EN;
}
