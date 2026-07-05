export const CHATGPT_ATTRIBUTES = {
  messageId: 'data-message-id',
  role: 'data-message-author-role',
  testId: 'data-testid',
} as const;

export const CHATGPT_SELECTORS = {
  conversationRoot: 'main[role="main"], main',
  extensionUi: [
    '[class*="chat-export-"]',
    '[data-chat-export-actions]',
    '[data-chat-export-format]',
    '[data-chat-export-icon]',
    '[data-chat-export-floating-panel]',
    '[data-chat-export-progress-mount]',
    '[data-chat-export-selection]',
    '[data-chat-export-selection-bar]',
    '[data-chat-export-settings]',
    '[data-chat-export-settings-button]',
    '[data-chat-export-selection-button]',
  ].join(', '),
  hidden: '[hidden], [aria-hidden="true"]',
  message: `[${CHATGPT_ATTRIBUTES.role}]`,
  messageContent: '[data-message-content], .markdown.prose',
  messageNonContent: [
    '[data-message-actions]',
    '[data-testid*="message-actions"]',
    '[role="menu"]',
    '[role="status"]',
    '[role="toolbar"]',
    'button',
    'nav',
  ].join(', '),
  streaming:
    '[data-is-streaming="true"], [data-message-streaming="true"], [aria-busy="true"]',
} as const;

export const CHATGPT_TEST_ID_PREFIX = 'conversation-turn-';
