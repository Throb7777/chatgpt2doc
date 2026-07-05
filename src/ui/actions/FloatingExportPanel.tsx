import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { ExportFormat } from '../../document/export';
import type { FloatingPanelPosition } from '../../settings/settings';
import type { UiStrings } from '../i18n';
import { FormatButton } from './ActionGroup';

interface FloatingExportPanelProps {
  collapsed: boolean;
  disabled: boolean;
  onPanelPositionChange: (position: FloatingPanelPosition) => void;
  onPanelPositionReset: () => void;
  onOpenSettings: () => void;
  onRequest: (format: ExportFormat) => void;
  onSelectMessages: () => void;
  panelPosition: FloatingPanelPosition | null;
  selectionActive: boolean;
  selectionDisabled: boolean;
  strings: UiStrings;
}

interface DragState {
  latestPosition: FloatingPanelPosition;
  moved: boolean;
  pointerId: number;
  startLeft: number;
  startPointerX: number;
  startPointerY: number;
  startTop: number;
}

function clampPanelPosition(
  position: FloatingPanelPosition,
  panel: HTMLElement,
): FloatingPanelPosition {
  const viewport = panel.ownerDocument.defaultView;
  const rect = panel.getBoundingClientRect();
  const margin = 8;
  const maxX = Math.max(margin, (viewport?.innerWidth ?? rect.right) - rect.width - margin);
  const maxY = Math.max(margin, (viewport?.innerHeight ?? rect.bottom) - rect.height - margin);
  return {
    x: Math.round(Math.max(margin, Math.min(position.x, maxX))),
    y: Math.round(Math.max(margin, Math.min(position.y, maxY))),
  };
}

function PanelIcon({ kind }: { kind: 'select' | 'settings' }) {
  return (
    <svg
      aria-hidden="true"
      class="chat-export-panel-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {kind === 'select' ? (
        <>
          <path d="M5.5 6.5h4v4h-4z" />
          <path d="M13 8.5h5.5" />
          <path d="M5.5 13.5h4v4h-4z" />
          <path d="M13 15.5h5.5" />
        </>
      ) : (
        <>
          <path d="M10.45 4.25h3.1l.48 2.05c.38.13.75.28 1.1.47l1.8-1.1 2.2 2.2-1.1 1.8c.19.35.34.72.47 1.1l2.05.48v3.1l-2.05.48c-.13.38-.28.75-.47 1.1l1.1 1.8-2.2 2.2-1.8-1.1c-.35.19-.72.34-1.1.47l-.48 2.05h-3.1l-.48-2.05a7.1 7.1 0 0 1-1.1-.47l-1.8 1.1-2.2-2.2 1.1-1.8a7.1 7.1 0 0 1-.47-1.1l-2.05-.48v-3.1l2.05-.48c.13-.38.28-.75.47-1.1l-1.1-1.8 2.2-2.2 1.8 1.1c.35-.19.72-.34 1.1-.47z" />
          <path d="M12 9.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8z" />
        </>
      )}
    </svg>
  );
}

export function FloatingExportPanel({
  collapsed,
  disabled,
  onPanelPositionChange,
  onPanelPositionReset,
  onOpenSettings,
  onRequest,
  onSelectMessages,
  panelPosition,
  selectionActive,
  selectionDisabled,
  strings,
}: FloatingExportPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const [dragPosition, setDragPosition] = useState(panelPosition);
  const currentPosition = dragPosition ?? panelPosition;

  useEffect(() => {
    setDragPosition(panelPosition);
  }, [panelPosition?.x, panelPosition?.y]);

  useEffect(() => () => {
    dragCleanup.current?.();
    dragCleanup.current = null;
  }, []);

  useEffect(() => {
    if (!currentPosition) return;
    const panel = panelRef.current;
    const view = panel?.ownerDocument.defaultView;
    if (!panel || !view) return;
    const onResize = () => {
      const clamped = clampPanelPosition(currentPosition, panel);
      if (clamped.x !== currentPosition.x || clamped.y !== currentPosition.y) {
        setDragPosition(clamped);
        onPanelPositionChange(clamped);
      }
    };
    view.addEventListener('resize', onResize);
    return () => view.removeEventListener('resize', onResize);
  }, [currentPosition?.x, currentPosition?.y, onPanelPositionChange]);

  const moveTo = (position: FloatingPanelPosition) => {
    const panel = panelRef.current;
    if (!panel) return;
    const clamped = clampPanelPosition(position, panel);
    setDragPosition(clamped);
    onPanelPositionChange(clamped);
  };

  const updateDragPosition = (pointerId: number, clientX: number, clientY: number): boolean => {
    const state = dragState.current;
    const panel = panelRef.current;
    if (!state || !panel || state.pointerId !== pointerId) return false;
    const next = clampPanelPosition({
      x: state.startLeft + clientX - state.startPointerX,
      y: state.startTop + clientY - state.startPointerY,
    }, panel);
    state.moved = true;
    state.latestPosition = next;
    setDragPosition(next);
    return true;
  };

  const finishDrag = (pointerId: number) => {
    const state = dragState.current;
    const panel = panelRef.current;
    if (!state || !panel || state.pointerId !== pointerId) return;
    dragCleanup.current?.();
    dragCleanup.current = null;
    dragState.current = null;
    const clamped = clampPanelPosition(state.latestPosition, panel);
    setDragPosition(clamped);
    if (state.moved) onPanelPositionChange(clamped);
  };

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = {
      latestPosition: { x: rect.left, y: rect.top },
      moved: false,
      pointerId: event.pointerId,
      startLeft: rect.left,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startTop: rect.top,
    };
    const doc = panel.ownerDocument;
    const onMove = (moveEvent: PointerEvent) => {
      updateDragPosition(moveEvent.pointerId, moveEvent.clientX, moveEvent.clientY);
    };
    const onUp = (upEvent: PointerEvent) => {
      finishDrag(upEvent.pointerId);
    };
    dragCleanup.current?.();
    dragCleanup.current = () => {
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onUp);
    };
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onUp);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Document-level listeners still handle synthetic or unsupported capture paths.
    }
    event.preventDefault();
  };

  const onMouseDown = (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || dragState.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = {
      latestPosition: { x: rect.left, y: rect.top },
      moved: false,
      pointerId: -1,
      startLeft: rect.left,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startTop: rect.top,
    };
    const doc = panel.ownerDocument;
    const onMove = (moveEvent: MouseEvent) => {
      updateDragPosition(-1, moveEvent.clientX, moveEvent.clientY);
    };
    const onUp = () => {
      finishDrag(-1);
    };
    dragCleanup.current?.();
    dragCleanup.current = () => {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
    event.preventDefault();
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    updateDragPosition(event.pointerId, event.clientX, event.clientY);
  };

  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for synthetic events.
    }
    finishDrag(event.pointerId);
  };

  const onPointerCancel = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    finishDrag(event.pointerId);
  };

  const onHandleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (event.key === 'Home') {
      event.preventDefault();
      setDragPosition(null);
      onPanelPositionReset();
      return;
    }
    const delta = event.shiftKey ? 16 : 8;
    const rect = panel.getBoundingClientRect();
    const current = currentPosition ?? { x: rect.left, y: rect.top };
    const offset = {
      ArrowDown: { x: 0, y: delta },
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
    }[event.key];
    if (!offset) return;
    event.preventDefault();
    moveTo({ x: current.x + offset.x, y: current.y + offset.y });
  };

  const panelStyle: JSX.CSSProperties | undefined = currentPosition
    ? {
        left: `${currentPosition.x}px`,
        right: 'auto',
        top: `${currentPosition.y}px`,
      }
    : undefined;

  return (
    <div
      aria-label={`${strings.export} ${strings.conversation}`}
      class={[
        'chat-export-floating-panel',
        collapsed ? 'chat-export-floating-panel--collapsed' : '',
        currentPosition ? 'chat-export-floating-panel--positioned' : '',
      ].filter(Boolean).join(' ')}
      ref={panelRef}
      role="group"
      style={panelStyle}
    >
      {(['docx', 'pdf'] as const).map((format) => (
        <FormatButton
          disabled={disabled}
          format={format}
          key={format}
          onRequest={onRequest}
          strings={strings}
          target={strings.conversation}
        />
      ))}
      <button
        aria-label={selectionActive ? strings.selecting : strings.selectMessages}
        class="chat-export-action-button chat-export-floating-command"
        data-chat-export-selection-button="true"
        disabled={selectionDisabled || selectionActive}
        onClick={onSelectMessages}
        type="button"
      >
        <PanelIcon kind="select" />
        <span class="chat-export-sr-only">{selectionActive ? strings.selecting : strings.selectMessages}</span>
      </button>
      <button
        aria-label={strings.settings}
        class="chat-export-action-button chat-export-floating-command"
        data-chat-export-settings-button="true"
        onClick={onOpenSettings}
        type="button"
      >
        <PanelIcon kind="settings" />
        <span class="chat-export-sr-only">{strings.settings}</span>
      </button>
      <button
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
        aria-label={strings.dragPanel}
        class="chat-export-panel-drag-handle"
        onKeyDown={onHandleKeyDown}
        onMouseDown={onMouseDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerCancel={onPointerCancel}
        onPointerUp={onPointerUp}
        type="button"
      >
        <span aria-hidden="true" class="chat-export-panel-grip" />
      </button>
    </div>
  );
}
