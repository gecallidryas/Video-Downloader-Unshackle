export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Extension contexts can expose clipboard but reject without a focused document.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand?.('copy') ?? false;
    if (!copied) {
      throw new Error('Clipboard copy failed');
    }
  } finally {
    textarea.remove();
  }
}
