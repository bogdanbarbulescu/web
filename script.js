console.log("--- script.js started ---");

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- DOMContentLoaded fired ---");

    // --- Element Selection ---
    const htmlEditorElement = document.getElementById('html-editor');
    const cssEditorElement = document.getElementById('css-editor');
    const jsEditorElement = document.getElementById('js-editor');
    const previewFrame = document.getElementById('preview'); // Inline preview iframe
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIconLight = themeToggleButton?.querySelector('.theme-icon-light');
    const themeIconDark = themeToggleButton?.querySelector('.theme-icon-dark');
    const editorContainer = document.getElementById('editor-container');
    const consoleContainer = document.getElementById('console-container');
    const consoleElement = document.getElementById('console');
    const consoleToggleButton = document.getElementById('console-toggle');
    const previewFullscreenButton = document.getElementById('preview-fullscreen-btn'); // Button to trigger modal
    const mainContainer = document.getElementById('main-container');
    const previewModalElement = document.getElementById('previewModal'); // The modal element
    const modalPreviewFrame = document.getElementById('modal-preview-iframe'); // Iframe inside the modal

    const STORAGE_KEY_PREFIX = 'webEditor_';

    // --- Initial Checks ---
    console.log("Attempting to find elements...");
    // Added checks for modal elements
    if (!htmlEditorElement || !cssEditorElement || !jsEditorElement || !previewFrame || !themeToggleButton || !editorContainer || !consoleContainer || !consoleElement || !consoleToggleButton || !previewFullscreenButton || !mainContainer || !previewModalElement || !modalPreviewFrame) {
        console.error("!!! CRITICAL: One or more essential elements not found (including modal elements). Check IDs in HTML match the script. !!!");
        alert("Initialization Error: Could not find all required page elements. Check console for details.");
        return;
    } else {
        console.log("All essential elements found.");
    }

    if (typeof CodeMirror === 'undefined') {
         console.error("!!! CRITICAL: CodeMirror library not loaded. Check CDN links/defer attribute in HTML. !!!");
         alert("Initialization Error: CodeMirror library failed to load. Check console for details.");
         return;
    } else {
        console.log("CodeMirror library found.");
    }

     // --- Bootstrap Modal Instance ---
    let previewModalInstance = null;
    try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
             previewModalInstance = new bootstrap.Modal(previewModalElement);
             console.log("Bootstrap Modal instance created.");
        } else {
            console.error("!!! CRITICAL: Bootstrap JavaScript not loaded or Modal component missing. !!!");
            alert("Initialization Error: Bootstrap Modal component failed to load. Check console for details.");
            // Don't necessarily return, maybe other features can still work?
        }
    } catch(e) {
        console.error("!!! CRITICAL: Error initializing Bootstrap Modal. !!!", e);
        alert("Initialization Error: Could not initialize preview modal. Check console for details.");
    }


    // --- Utility Functions ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function loadFromLocalStorage(key, defaultValue = '') {
        try {
            const value = localStorage.getItem(STORAGE_KEY_PREFIX + key);
            // console.log(`Loaded '${key}' from localStorage:`, value !== null ? `${value.substring(0, 50)}...` : 'null');
            return value || defaultValue;
        } catch (e) {
            console.warn(`Could not load '${key}' from localStorage:`, e);
            return defaultValue;
        }
    }

    function saveToLocalStorage(key, value) {
        try {
            localStorage.setItem(STORAGE_KEY_PREFIX + key, value);
            // console.log(`Saved '${key}' to localStorage.`);
        } catch (e) {
            console.warn(`Could not save '${key}' to localStorage:`, e);
             if (e.name === 'QuotaExceededError') {
                alert('Could not save changes. Browser local storage might be full.');
            }
        }
    }

    // --- CodeMirror Initialization ---
    console.log("Initializing CodeMirror editors...");
    let editors;
    try {
        const commonConfig = {
            lineNumbers: true,
            autoCloseTags: true,
            autoCloseBrackets: true,
            lineWrapping: true,
        };
        const initialHtml = loadFromLocalStorage('html');
        const initialCss = loadFromLocalStorage('css');
        const initialJs = loadFromLocalStorage('js');
        const htmlEditor = CodeMirror.fromTextArea(htmlEditorElement, { ...commonConfig, mode: 'htmlmixed', theme: 'neat', value: initialHtml });
        const cssEditor = CodeMirror.fromTextArea(cssEditorElement, { ...commonConfig, mode: 'css', theme: 'neat', value: initialCss });
        const jsEditor = CodeMirror.fromTextArea(jsEditorElement, { ...commonConfig, mode: 'javascript', theme: 'neat', value: initialJs });
        editors = { html: htmlEditor, css: cssEditor, js: jsEditor };
        console.log("CodeMirror editors initialized successfully.");
    } catch (error) {
        console.error("!!! CRITICAL: Failed to initialize CodeMirror editors. !!!", error);
        alert("Initialization Error: Failed to create code editors. Check console for details.");
        return;
    }

    // --- Function to build the preview content (srcDoc) ---
    function buildPreviewSrcDoc() {
        const htmlCode = editors.html.getValue();
        const cssCode = editors.css.getValue();
        const jsCode = editors.js.getValue();

        // Console interception script (same as before)
        const consoleInterceptor = `
            <script>
                const originalConsoleLog = console.log;
                const originalConsoleError = console.error;
                const originalConsoleWarn = console.warn;
                const originalConsoleInfo = console.info;
                // Get console element from the main window (parent)
                const parentConsole = window.parent.document.getElementById('console');

                function formatMessageArgs(args) {
                    return Array.from(args).map(arg => {
                         if (arg instanceof Error) { return arg.stack || arg.toString(); }
                         else if (typeof arg === 'object' && arg !== null) {
                            try { return JSON.stringify(arg, null, 2); } catch (e) { return '[Unserializable Object]'; }
                        }
                        return String(arg);
                    }).join(' ');
                }

                function postMessageToParent(type, args) {
                     // Only post if running in an iframe context where parent console exists
                     if (!parentConsole || window.self === window.top) return;
                     const message = formatMessageArgs(args);
                     try {
                         const pre = window.parent.document.createElement('pre'); // Use parent document
                         pre.className = 'console-' + type;
                         pre.textContent = message;
                         parentConsole.appendChild(pre);
                         parentConsole.scrollTop = parentConsole.scrollHeight;
                     } catch (e) {
                         // Fallback if direct parent manipulation fails (e.g., stricter sandboxing)
                         originalConsoleError('Error posting message to parent console:', e);
                     }
                }

                console.log = (...args) => { originalConsoleLog.apply(console, args); postMessageToParent('log', args); };
                console.error = (...args) => { originalConsoleError.apply(console, args); postMessageToParent('error', args); };
                console.warn = (...args) => { originalConsoleWarn.apply(console, args); postMessageToParent('warn', args); };
                console.info = (...args) => { originalConsoleInfo.apply(console, args); postMessageToParent('info', args); };

                window.onerror = function(message, source, lineno, colno, error) {
                    const errorArgs = [message, 'at', source + ':' + lineno + ':' + colno];
                    if (error && error.stack) { errorArgs.push('\\nStack: ' + error.stack); }
                    postMessageToParent('error', errorArgs);
                };
                window.onunhandledrejection = function(event) {
                    postMessageToParent('error', ['Unhandled Promise Rejection:', event.reason]);
                };
            <\/script>
        `;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${cssCode}</style>
            </head>
            <body>
                ${htmlCode}
                ${consoleInterceptor}
                <script>
                    try {
                        ${jsCode}
                    } catch (e) {
                        console.error('Error executing user script:', e);
                    }
                <\/script>
            </body>
            </html>
        `;
    }


    // --- Live Preview Update (for inline preview) ---
    const updateInlinePreview = debounce(() => {
        // console.log("Updating inline preview...");
        try {
            const srcDoc = buildPreviewSrcDoc(); // Build the content

            // Save current code to Local Storage
            saveToLocalStorage('html', editors.html.getValue());
            saveToLocalStorage('css', editors.css.getValue());
            saveToLocalStorage('js', editors.js.getValue());

            consoleElement.innerHTML = ''; // Clear console before running new code
            previewFrame.srcdoc = srcDoc; // Update the inline iframe
            // console.log("Inline preview update complete.");
        } catch (error) {
            console.error("Error during inline preview update:", error);
             if(consoleElement) {
                 const pre = document.createElement('pre');
                 pre.className = 'console-error';
                 pre.textContent = `Editor Error: Failed to update inline preview.\n${error.stack || error}`;
                 consoleElement.appendChild(pre);
                 consoleElement.scrollTop = consoleElement.scrollHeight;
            }
        }
    }, 300);

    editors.html.on('change', updateInlinePreview);
    editors.css.on('change', updateInlinePreview);
    editors.js.on('change', updateInlinePreview);

    // --- Theme Toggling ---
    const savedTheme = loadFromLocalStorage('theme', 'light');
    function applyTheme(theme) {
        const cmTheme = theme === 'light' ? 'neat' : 'monokai';
        document.documentElement.setAttribute('data-bs-theme', theme);
        Object.values(editors).forEach(editor => editor.setOption('theme', cmTheme));
        themeIconLight?.classList.toggle('d-none', theme === 'dark');
        themeIconDark?.classList.toggle('d-none', theme === 'light');
         // console.log("Applied theme:", theme);
    }
    themeToggleButton.addEventListener('click', () => {
        // console.log("Toggling theme...");
        try {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            saveToLocalStorage('theme', newTheme);
        } catch (error) {
            console.error("Error toggling theme:", error);
        }
    });
    applyTheme(savedTheme); // Apply initial theme

    // --- Console Toggle ---
    consoleToggleButton.addEventListener('click', () => {
        // console.log("Toggling console...");
        try {
            const consoleWrapper = consoleContainer;
            const isExpanded = consoleWrapper.classList.toggle('expanded');
            const icon = consoleToggleButton.querySelector('i');
            consoleToggleButton.setAttribute('aria-expanded', isExpanded);
             if (icon) {
                icon.classList.toggle('bi-chevron-expand', !isExpanded);
                icon.classList.toggle('bi-chevron-contract', isExpanded);
            }
            consoleToggleButton.title = isExpanded ? 'Collapse Console' : 'Expand Console';
            // console.log("Console expanded:", isExpanded);
        } catch (error) {
            console.error("Error toggling console:", error);
        }
    });

     // --- Editor Panel Controls (Event Delegation - No changes needed here) ---
    editorContainer.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const panel = button.closest('.editor-panel');
        if (!panel) return;
        const editorId = panel.dataset.editorId;
        if (!editorId || !editors[editorId]) return;
        const editor = editors[editorId];
        const icon = button.querySelector('i');
        // console.log(`Button clicked in panel '${editorId}':`, button.className);
        try {
            if (button.classList.contains('btn-minimize')) { /* ... minimize logic ... */
                const isMinimized = panel.classList.toggle('minimized');
                const isExpanded = !isMinimized;
                button.setAttribute('aria-expanded', isExpanded);
                if (icon) {
                    icon.classList.toggle('bi-dash-lg', isExpanded);
                    icon.classList.toggle('bi-plus-lg', isMinimized);
                }
                button.title = isExpanded ? 'Minimize' : 'Restore';
                if (isExpanded) { setTimeout(() => editor.refresh(), 350); }
            }
            else if (button.classList.contains('btn-maximize')) { /* ... maximize logic ... */
                 const isCurrentlyMaximized = panel.classList.contains('maximized');
                let restoreMode = false;
                const currentlyMaximizedPanel = editorContainer.querySelector('.editor-panel.maximized');
                if (currentlyMaximizedPanel) {
                    currentlyMaximizedPanel.classList.remove('maximized');
                    const maxBtn = currentlyMaximizedPanel.querySelector('.btn-maximize');
                    const maxIcon = maxBtn?.querySelector('i');
                    if (maxIcon) maxIcon.classList.replace('bi-arrows-angle-contract', 'bi-arrows-fullscreen');
                    if (maxBtn) maxBtn.title = 'Maximize';
                    if (currentlyMaximizedPanel === panel) restoreMode = true;
                    if (restoreMode) editorContainer.classList.remove('has-maximized');
                }
                if (!restoreMode) {
                    panel.classList.add('maximized');
                    editorContainer.classList.add('has-maximized');
                    if (icon) icon.classList.replace('bi-arrows-fullscreen', 'bi-arrows-angle-contract');
                    button.title = 'Restore';
                }
                setTimeout(() => Object.values(editors).forEach(ed => ed.refresh()), 50);
            }
            else if (button.classList.contains('btn-clear')) { editor.setValue(''); }
            else if (button.classList.contains('btn-copy')) { /* ... copy logic ... */
                const code = editor.getValue();
                try {
                    if (navigator.clipboard && code) {
                        navigator.clipboard.writeText(code).then(() => {
                            const originalIconClass = 'bi-clipboard';
                            const successIconClass = 'bi-clipboard-check-fill';
                            if (icon) icon.classList.replace(originalIconClass, successIconClass);
                            button.classList.add('copied', 'btn-success'); button.classList.remove('btn-outline-secondary'); button.title = 'Copied!';
                            setTimeout(() => {
                                if (icon) icon.classList.replace(successIconClass, originalIconClass);
                                button.classList.remove('copied', 'btn-success'); button.classList.add('btn-outline-secondary'); button.title = 'Copy Code';
                            }, 1500);
                        }).catch(err => { console.error(`Copy failed:`, err); button.title = 'Copy Failed!'; setTimeout(() => { button.title = 'Copy Code'; }, 1500); });
                    } else if (!code) { button.title = 'Nothing to copy!'; setTimeout(() => { button.title = 'Copy Code'; }, 1000); }
                    else { console.warn("Clipboard API not available."); button.title = 'Copy not supported'; setTimeout(() => { button.title = 'Copy Code'; }, 2000); }
                } catch(copyError) { console.error(`Clipboard error:`, copyError); button.title = 'Copy Error!'; setTimeout(() => { button.title = 'Copy Code'; }, 1500); }
            }
        } catch (error) { console.error(`Button click error (${editorId}):`, error); }
    });

    // --- MODIFIED: Preview Modal Trigger ---
    previewFullscreenButton.addEventListener('click', () => {
        console.log("Preview modal button clicked.");
        if (!previewModalInstance) {
            console.error("Modal instance not available!");
            alert("Error: Preview modal could not be initialized.");
            return;
        }
        try {
            console.log("Building content for modal...");
            const srcDoc = buildPreviewSrcDoc(); // Generate the latest preview content

            console.log("Setting modal iframe srcdoc...");
            modalPreviewFrame.srcdoc = srcDoc; // Set the content of the iframe *inside* the modal

            console.log("Showing modal...");
            previewModalInstance.show(); // Show the modal
            console.log("Modal shown.");

        } catch (error) {
            console.error("Error preparing or showing preview modal:", error);
            alert("Error: Could not open preview modal. Check console for details.");
        }
    });
    // --- End MODIFIED Section ---


    // --- Export Functionality (No changes needed here) ---
    function triggerDownload(filename, content, mimeType) {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            // console.log(`Triggered download for ${filename}`);
        } catch (error) { console.error(`Download error (${filename}):`, error); alert(`Failed download for ${filename}.`); }
    }
    document.getElementById('export-html')?.addEventListener('click', () => triggerDownload('index.html', editors.html.getValue(), 'text/html'));
    document.getElementById('export-css')?.addEventListener('click', () => triggerDownload('style.css', editors.css.getValue(), 'text/css'));
    document.getElementById('export-js')?.addEventListener('click', () => triggerDownload('script.js', editors.js.getValue(), 'application/javascript'));
    document.getElementById('export-all')?.addEventListener('click', () => {
        try {
            const htmlCode = editors.html.getValue(); const cssCode = editors.css.getValue(); const jsCode = editors.js.getValue();
            const fullHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Exported Project</title><style>${cssCode}</style></head><body>${htmlCode}<script>(function(){try{${jsCode}}catch(e){console.error("Error executing embedded script:",e);}})();<\/script></body></html>`;
            triggerDownload('project.html', fullHtml, 'text/html');
        } catch (error) { console.error("Export All error:", error); alert('Failed export all.'); }
    });

    // --- Initial Preview Render ---
    console.log("Performing initial inline preview render.");
    updateInlinePreview(); // Render the inline preview on load

    console.log("--- Editor setup complete ---");

}); // End DOMContentLoaded
