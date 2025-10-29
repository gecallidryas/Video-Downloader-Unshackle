import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

interface OverflowMenuProps {
  actions: MenuAction[];
  onAction: (actionId: string) => void;
  'aria-label'?: string;
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  minWidth: 160,
  background: 'var(--surface-container-high, #1e1e1e)',
  border: '1px solid var(--outline-variant, #333)',
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  padding: 4,
  zIndex: 30,
};

const itemBaseStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 13,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 4,
  color: 'var(--on-surface, inherit)',
};

const dangerStyle: CSSProperties = { color: 'var(--error, #ef4444)' };

const triggerStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--on-surface-variant, inherit)',
  borderRadius: 4,
  cursor: 'pointer',
};

export function OverflowMenu({ actions, onAction, ...rest }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const ariaLabel = rest['aria-label'] ?? 'More actions';

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="overflow-menu"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="overflow-menu__trigger"
        style={triggerStyle}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" className="overflow-menu__panel" style={panelStyle}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              className={`overflow-menu__item${action.danger ? ' overflow-menu__item--danger' : ''}`}
              style={action.danger ? { ...itemBaseStyle, ...dangerStyle } : itemBaseStyle}
              onClick={() => {
                setOpen(false);
                onAction(action.id);
              }}
            >
              {action.icon ? <span aria-hidden="true">{action.icon} </span> : null}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
