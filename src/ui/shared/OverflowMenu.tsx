import { useCallback, useEffect, useRef, useState } from 'react';
import './OverflowMenu.css';

export interface MenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export interface OverflowMenuProps {
  actions: MenuAction[];
  onAction: (actionId: string) => void;
  'aria-label'?: string;
}

export function OverflowMenu({
  actions,
  onAction,
  'aria-label': ariaLabel,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(0);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      itemsRef.current[focusedIndex]?.focus();
    }
  }, [open, focusedIndex]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex((index) => Math.min(index + 1, actions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((index) => Math.max(index - 1, 0));
    }
  }

  function handleSelect(action: MenuAction) {
    if (action.disabled) {
      return;
    }
    onAction(action.id);
    close();
  }

  return (
    <div className="overflow-menu" ref={rootRef}>
      <button
        type="button"
        className="overflow-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? 'More actions'}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="3" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="13" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="overflow-menu__panel"
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              ref={(element) => {
                itemsRef.current[index] = element;
              }}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              className={
                action.danger
                  ? 'overflow-menu__item overflow-menu__item--danger'
                  : 'overflow-menu__item'
              }
              onClick={() => handleSelect(action)}
            >
              {action.icon ? (
                <span className="overflow-menu__icon" aria-hidden="true">
                  {action.icon}
                </span>
              ) : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
