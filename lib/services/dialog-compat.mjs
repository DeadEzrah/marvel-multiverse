/**
 * Cross-version dialog helpers. Prefers the modern `foundry.applications.api.DialogV2` API
 * (Foundry V12+) and falls back to the classic `Dialog` application when DialogV2 is unavailable.
 * Callback/render functions always receive a plain root `HTMLElement` to query against, regardless
 * of which underlying API rendered the dialog, so callers do not need to branch on API version.
 */

function getDialogV2() {
  return globalThis.foundry?.applications?.api?.DialogV2 ?? null;
}

/**
 * `DialogV2` renders its own top-level `<form>` wrapper around dialog content. If the supplied
 * content string also contains a `<form>...</form>` wrapper (a pattern used by some of this
 * system's older dialog templates, written for classic `Dialog`), the result is invalid, nested
 * HTML that can break form submission. Replace a single outer `<form>` with a plain `<div>` so the
 * content's fields still get hoisted into DialogV2's own form.
 * @param {string} content
 * @returns {string}
 */
function stripNestedForm(content) {
  if (typeof content !== "string") return content;
  return content.replace(/<form\b/i, "<div").replace(/<\/form>/i, "</div>");
}

/**
 * Render a single-button "prompt" dialog. Prefers `DialogV2.prompt`, falling back to the classic
 * `Dialog.prompt` when DialogV2 is unavailable.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.content
 * @param {string} [options.label] - Confirmation button label.
 * @param {(root: HTMLElement) => any} options.callback - Receives the dialog's root content element.
 * @param {(root: HTMLElement) => void} [options.render] - Invoked after every render.
 * @param {boolean} [options.rejectClose=false]
 * @returns {Promise<any>} Resolves to the callback's return value, or null if dismissed/unavailable.
 */
export async function promptDialog({ title, content, label, callback, render, rejectClose = false } = {}) {
  const DialogV2 = getDialogV2();
  if (DialogV2?.prompt) {
    return DialogV2.prompt({
      window: { title },
      content: stripNestedForm(content),
      ok: {
        ...(label ? { label } : {}),
        callback: (_event, button) => callback?.(button.form ?? button),
      },
      render: render ? (_event, dialog) => render(dialog.element) : undefined,
      rejectClose,
    });
  }
  if (globalThis.Dialog?.prompt) {
    return globalThis.Dialog.prompt({
      title,
      content,
      ...(label ? { label } : {}),
      callback: (html) => callback?.(html?.[0] ?? html),
      render: render ? (html) => render(html?.[0] ?? html) : undefined,
      rejectClose,
    });
  }
  return null;
}
