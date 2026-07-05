import { mergeMessageOrder } from '../../platform/chatgpt/conversation-collector';
import type { DiscoveredChatMessage } from '../../platform/chatgpt/message-discovery';

export class MessageSelectionState {
  active = false;
  private conversationUrl = '';
  private knownOrder: string[] = [];
  private readonly selectedIds = new Set<string>();
  private readonly statuses = new Map<string, DiscoveredChatMessage['status']>();

  update(url: string, messages: DiscoveredChatMessage[]): void {
    if (this.conversationUrl && this.conversationUrl !== url) this.cancel();
    this.conversationUrl = url;
    if (!this.active) return;

    this.knownOrder = mergeMessageOrder(
      this.knownOrder,
      messages.map(({ id }) => id),
    );
    for (const { id, status } of messages) {
      this.statuses.set(id, status);
      if (status === 'streaming') this.selectedIds.delete(id);
    }
  }

  start(url: string, messages: DiscoveredChatMessage[]): void {
    this.active = true;
    this.conversationUrl = url;
    this.knownOrder = [];
    this.selectedIds.clear();
    this.statuses.clear();
    this.update(url, messages);
  }

  toggle(messageId: string, selected: boolean): void {
    if (!this.active || this.statuses.get(messageId) !== 'complete') return;
    if (selected) this.selectedIds.add(messageId);
    else this.selectedIds.delete(messageId);
  }

  isSelected(messageId: string): boolean {
    return this.selectedIds.has(messageId);
  }

  selectedInSourceOrder(): string[] {
    return this.knownOrder.filter((id) => this.selectedIds.has(id));
  }

  cancel(): void {
    this.active = false;
    this.knownOrder = [];
    this.selectedIds.clear();
    this.statuses.clear();
  }
}
