import { api } from '@/lib/api';

let closeActivePreview: (() => void) | undefined;

export async function openStoredAttachment(viewUrlPath: string, title = '附件预览') {
  const preview = createAttachmentPreview(title);
  try {
    const { url } = await api.get<{ url: string }>(viewUrlPath);
    preview.show(url);
  } catch (error) {
    preview.close();
    throw error;
  }
}

export function openLocalAttachment(file: File) {
  const url = URL.createObjectURL(file);
  const preview = createAttachmentPreview(file.name, () => URL.revokeObjectURL(url));
  preview.show(url);
}

function createAttachmentPreview(title: string, onClose?: () => void) {
  closeActivePreview?.();

  const previousOverflow = document.body.style.overflow;
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.72)',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    width: 'min(1200px, 96vw)',
    height: 'min(860px, 92vh)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: '12px',
    background: 'var(--background, #fff)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
  });

  const heading = document.createElement('div');
  heading.textContent = title;
  Object.assign(heading.style, {
    flex: '1',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '14px',
    fontWeight: '600',
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '关闭';
  closeButton.setAttribute('aria-label', '关闭附件预览');
  Object.assign(closeButton.style, {
    height: '34px',
    padding: '0 12px',
    cursor: 'pointer',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'inherit',
    fontSize: '14px',
  });

  const content = document.createElement('div');
  content.textContent = '附件加载中，请稍候…';
  Object.assign(content.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground, #64748b)',
    background: '#f8fafc',
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', handleKeyDown);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (closeActivePreview === close) closeActivePreview = undefined;
    onClose?.();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', handleKeyDown);

  header.append(heading, closeButton);
  panel.append(header, content);
  overlay.append(panel);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  closeActivePreview = close;
  closeButton.focus();

  return {
    close,
    show(url: string) {
      if (closed) return;
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = title;
      frame.setAttribute('allowfullscreen', 'true');
      Object.assign(frame.style, {
        width: '100%',
        height: '100%',
        border: '0',
        background: '#fff',
      });
      content.replaceChildren(frame);
      content.style.display = 'block';
    },
  };
}
