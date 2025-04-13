document.addEventListener('DOMContentLoaded', () => {
    // --- CodeMirror Initialization ---
    const htmlEditor = CodeMirror.fromTextArea(document.getElementById('html-editor'), {
        lineNumbers: true,
        mode: 'htmlmixed',
        theme: 'neat', // Start with light theme (will be updated by theme loader)
        lineWrapping: true,
        autoCloseTags: true // Enable addon
    });

    const cssEditor = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
        lineNumbers: true,
        mode: 'css',
        theme: 'neat', // Start with light theme
        lineWrapping: true,
        autoCloseBrackets: true // Enable addon
    });

    const jsEditor = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        lineNumbers: true,
        mode: 'javascript',
        theme: 'neat', // Start with light theme
        lineWrapping: true,
        autoCloseBrackets: true // Enable addon
    });

    // --- DOM Element References ---
    const previewFrame = document.getElementById('preview');
    const editorContainer = document.getElementById('editor-container');
    const consoleElement = document.getElementById('console');
    const consoleToggleBtn = document.getElementById('console-toggle');
    const consoleContainer = document.getElementById('console-container');
    const previewMaximizeBtn = document.getElementById('preview-fullscreen-btn'); // Button for preview maximize/restore
    const mainContainer = document.getElementById('main-container'); // Main content area container
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = themeToggle.querySelector('.bi-sun-fill');
    const moonIcon = themeToggle.querySelector('.bi-moon-stars-fill');
    const htmlElement = document.documentElement;

    // Store editors in an object for easy access by ID
    const editors = {
        html: htmlEditor,
        css: cssEditor,
        js: jsEditor
    };

    // --- Update Preview ---
    let previewTimeout;
    function updatePreview() {
        // Debounce preview update slightly to avoid excessive updates during typing
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => {
            const htmlCode = htmlEditor.getValue();
            const cssCode = `<style>${cssEditor.getValue()}</style>`;
            // Use a try-catch block for basic JS syntax check before injecting
            let jsCodeToRun = '';
            try {
                // Basic check if JS is not empty before trying to wrap it
                const rawJs = jsEditor.getValue();
                if (rawJs.trim()) {
                     // This doesn't actually run the JS here, just prepares the string
                    jsCodeToRun = `<script>${rawJs.replace(/<\/script>/gi, '<\\/script>')}<\/script>`; // Escape closing script tag carefully
                }
            } catch (e) {
                console.error("JavaScript Syntax Error prevented preview update:", e);
                 const errorEntry = document.createElement('div');
                 errorEntry.style.color = 'var(--bs-warning)'; // Use warning color
                 errorEntry.textContent = `Preview JS Error (check browser console): ${e.message}`;
                 consoleElement.appendChild(errorEntry);
                 consoleElement.scrollTop = consoleElement.scrollHeight;
            }


            const combinedCode = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Preview</title>
                    ${cssCode}
                    <script>
                        // Capture console logs from iframe
                        window.console.log = (...args) => {
                            // Convert arguments to serializable format if needed
                            const serializableArgs = args.map(arg => {
                                try {
                                    // Basic check for non-serializable types (like functions, Symbols)
                                    if (typeof arg === 'function' || typeof arg === 'symbol') {
                                        return arg.toString();
                                    }
                                    // Attempt to clone, fallback to string conversion
                                    return JSON.parse(JSON.stringify(arg));
                                } catch (e) {
                                    return String(arg); // Fallback for complex/circular objects
                                }
                            });
                            window.parent.postMessage({ type: 'log', args: serializableArgs }, '*');
                        };
                        // Capture errors from iframe
                        window.onerror = function(message, source, lineno, colno, error) {
                             window.parent.postMessage({ type: 'error', message: message, lineno: lineno }, '*');
                             return true; // Prevent default browser error handling in iframe console
                         };
                    <\/script>
                </head>
                <body>
                    ${htmlCode}
                    ${jsCodeToRun}
                </body>
                </html>
            `;

            // Use srcdoc for security and simplicity
            previewFrame.srcdoc = combinedCode;

        }, 300); // 300ms debounce delay
    }

    // Update preview on editor changes
    htmlEditor.on('change', updatePreview);
    cssEditor.on('change', updatePreview);
    jsEditor.on('change', updatePreview);


    // --- Console Logging (Capture from iframe and direct calls) ---
    const originalConsoleLog = console.log; // Keep reference to original browser console.log

    function logToEditorConsole(...args) {
         const message = args.map(arg => {
             if (arg === undefined) return 'undefined';
             if (arg === null) return 'null';
             // Attempt to stringify objects, handle potential circular refs
             if (typeof arg === 'object') {
                try {
                    // Use JSON.stringify with a replacer to handle potential errors/BigInts/Functions/Symbols
                    return JSON.stringify(arg, (key, value) => {
                        if (typeof value === 'bigint') return value.toString() + 'n';
                        if (typeof value === 'function') return `[Function ${value.name || ''}]`;
                         if (typeof value === 'symbol') return value.toString();
                         if (value instanceof Error) return `[Error: ${value.message}]`;
                        return value;
                    }, 2); // Indent with 2 spaces
                } catch (e) {
                    // Handle circular structure or other errors
                    if (e instanceof TypeError && e.message.includes('circular structure')) {
                         return '[Circular Object]';
                    }
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' ');

        const logEntry = document.createElement('div');
        logEntry.textContent = `> ${message}`;
        consoleElement.appendChild(logEntry);
        consoleElement.scrollTop = consoleElement.scrollHeight; // Auto-scroll
    }

     // Override window.console.log to capture logs in the editor's console div
     console.log = function(...args) {
        originalConsoleLog.apply(console, args); // Log to browser console as well
        logToEditorConsole(...args); // Log to the editor's console
    };

     // Capture errors from the main window context
     window.onerror = function(message, source, lineno, colno, error) {
        originalConsoleLog.error("Error:", message, "at", source, ":", lineno, error); // Log full error to browser console
        const errorEntry = document.createElement('div');
        errorEntry.style.color = 'var(--bs-danger)'; // Use Bootstrap's danger color
        errorEntry.textContent = `Error: ${message} (line ${lineno})`;
        consoleElement.appendChild(errorEntry);
        consoleElement.scrollTop = consoleElement.scrollHeight;
        return true; // Prevent default browser error handling
    };

     // Listen for messages (logs/errors) from the iframe
     window.addEventListener('message', (event) => {
         // Security check: Allow messages only from the same origin ('null' for srcdoc is okay here)
         if (event.origin !== 'null' && event.origin !== window.location.origin) {
             console.warn("Blocked message from untrusted origin:", event.origin);
             return;
         }

         const data = event.data;
         if (data && data.type === 'log') {
             logToEditorConsole(...data.args);
         } else if (data && data.type === 'error') {
              const errorEntry = document.createElement('div');
              errorEntry.style.color = 'var(--bs-danger)';
              errorEntry.textContent = `Error (Preview): ${data.message} (line ${data.lineno})`;
              consoleElement.appendChild(errorEntry);
              consoleElement.scrollTop = consoleElement.scrollHeight;
         }
     });


    // --- Console Toggle ---
    consoleToggleBtn.addEventListener('click', () => {
        const isMinimized = consoleToggleBtn.dataset.state === 'minimized';
        const icon = consoleToggleBtn.querySelector('i');

        if (isMinimized) {
            consoleContainer.classList.add('expanded');
            consoleElement.style.display = 'block'; // Make visible before transition starts
            consoleToggleBtn.dataset.state = 'expanded';
            consoleToggleBtn.title = 'Minimize Console';
            // Icon change handled by CSS attribute selector [data-state="expanded"]

        } else {
            consoleContainer.classList.remove('expanded');
            consoleToggleBtn.dataset.state = 'minimized';
            consoleToggleBtn.title = 'Expand Console';
             // Icon change handled by CSS attribute selector [data-state="minimized"]

             // Delay hiding until transition finishes (approx 300ms from CSS)
             // Check state again in case of rapid clicks before timeout fires
             setTimeout(() => {
                 if (consoleToggleBtn.dataset.state === 'minimized') {
                      consoleElement.style.display = 'none';
                 }
            }, 300);
        }
    });


    // --- Function to Restore All Maximize States (Helper) ---
    function restoreAllMaximizeStates() {
        let needsRefresh = false;

        // Restore editor maximize state
        if (editorContainer.classList.contains('has-maximized')) {
            editorContainer.querySelectorAll('.editor-panel.maximized').forEach(p => {
                p.classList.remove('maximized');
                const maxBtn = p.querySelector('.btn-maximize');
                maxBtn.title = 'Maximize';
                // Icon reset is handled by CSS removing .maximized class
            });
            editorContainer.classList.remove('has-maximized');
            needsRefresh = true;
        }

        // Restore preview maximize state
        if (mainContainer.classList.contains('preview-maximized')) {
            mainContainer.classList.remove('preview-maximized');
            previewMaximizeBtn.title = 'Maximize Preview';
            previewMaximizeBtn.classList.remove('restore-internal');
            previewMaximizeBtn.classList.add('maximize-internal');
            // Icon reset is handled by CSS removing .restore-internal class
            needsRefresh = true;
        }

        // Refresh editors only if a state was actually changed
        if (needsRefresh) {
            setTimeout(() => {
                Object.values(editors).forEach(ed => ed.refresh());
            }, 50); // Small delay for layout to settle
        }
    }


    // --- Editor Panel Actions (Minimize, Maximize, Clear) ---
    editorContainer.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const panel = button.closest('.editor-panel');
        if (!panel) return;
        const editorId = panel.dataset.editorId;
        const editor = editors[editorId];

        // Clear Action
        if (button.classList.contains('btn-clear')) {
            if (editor) {
                editor.setValue(''); // Clears content, triggers 'change' -> updatePreview
            }
        }
        // Minimize/Restore Action
        else if (button.classList.contains('btn-minimize')) {
            // If preview is maximized, restore everything first
            if (mainContainer.classList.contains('preview-maximized')) {
                restoreAllMaximizeStates();
            }
             // If another editor is maximized, restore it first
             if (editorContainer.classList.contains('has-maximized') && !panel.classList.contains('maximized')) {
                 restoreAllMaximizeStates();
             }

            const isMinimized = panel.classList.toggle('minimized');
            button.title = isMinimized ? 'Restore' : 'Minimize';
            // Icon change is handled by CSS based on .minimized class

            // If restoring, ensure it's not marked as maximized
            if (!isMinimized) {
                 panel.classList.remove('maximized');
                 // Maximize button state might need resetting if it was maximized *then* minimized
                 const maxBtn = panel.querySelector('.btn-maximize');
                 maxBtn.title = 'Maximize';
            } else {
                // If minimizing, ensure it's removed from maximized state
                panel.classList.remove('maximized');
                editorContainer.classList.remove('has-maximized'); // Ensure container state is correct
                const maxBtn = panel.querySelector('.btn-maximize');
                maxBtn.title = 'Maximize';
            }

            // Refresh this editor's layout
            setTimeout(() => editor?.refresh(), 50);
        }
        // Maximize/Restore Action (Editor Panel)
        else if (button.classList.contains('btn-maximize')) {
             // If preview is maximized, restore it first
             if (mainContainer.classList.contains('preview-maximized')) {
                 restoreAllMaximizeStates();
             }

            const isCurrentlyMaximized = panel.classList.contains('maximized');

            // Always restore all other editor panels first
            editorContainer.querySelectorAll('.editor-panel').forEach(p => {
                if (p !== panel) {
                     p.classList.remove('maximized'); // Remove maximized from others
                     // Don't remove 'minimized' state here, only reset maximize button
                     const maxBtn = p.querySelector('.btn-maximize');
                     maxBtn.title = 'Maximize';
                }
            });

             editorContainer.classList.remove('has-maximized'); // Reset container state initially


            if (!isCurrentlyMaximized) {
                // Maximize the current panel
                panel.classList.remove('minimized'); // Ensure it's not minimized
                panel.classList.add('maximized');
                button.title = 'Restore';
                editorContainer.classList.add('has-maximized'); // Set container state
                 // Icon change handled by CSS
            } else {
                 // If it was currently maximized, clicking again restores it
                 panel.classList.remove('maximized');
                 button.title = 'Maximize';
                  // Container state already removed above
                 // Icon change handled by CSS
            }

            // Refresh all editors' layout after potential major shift
             setTimeout(() => {
                 Object.values(editors).forEach(ed => ed.refresh());
             }, 50);
        }
    });


    // --- Preview Maximize/Restore (within App) ---
    previewMaximizeBtn.addEventListener('click', () => {
        const isPreviewMaximized = mainContainer.classList.contains('preview-maximized');

        // If any editor is maximized, restore it first before maximizing preview
        if (editorContainer.classList.contains('has-maximized')) {
             restoreAllMaximizeStates();
        }

        // Toggle the preview maximized state
        mainContainer.classList.toggle('preview-maximized');

        // Update button title and classes based on the new state
        if (mainContainer.classList.contains('preview-maximized')) {
            previewMaximizeBtn.title = 'Restore Preview';
            previewMaximizeBtn.classList.remove('maximize-internal');
            previewMaximizeBtn.classList.add('restore-internal');
             // Icon change handled by CSS
        } else {
            previewMaximizeBtn.title = 'Maximize Preview';
            previewMaximizeBtn.classList.remove('restore-internal');
            previewMaximizeBtn.classList.add('maximize-internal');
             // Icon change handled by CSS
        }

         // Refresh editors after layout change (especially needed when restoring)
        setTimeout(() => {
            Object.values(editors).forEach(ed => ed.refresh());
        }, 50);
    });


    // --- Light/Dark Theme Toggle ---
    const applyTheme = (theme) => {
        htmlElement.setAttribute('data-bs-theme', theme);
        // Choose CodeMirror theme based on Bootstrap theme
        const codeMirrorTheme = theme === 'dark' ? 'monokai' : 'neat';

        // Apply theme to all editors
        Object.values(editors).forEach(editor => {
            editor.setOption('theme', codeMirrorTheme);
        });

        // Update toggle button icon visibility
        if (theme === 'dark') {
            sunIcon.classList.add('d-none');
            moonIcon.classList.remove('d-none');
        } else {
            sunIcon.classList.remove('d-none');
            moonIcon.classList.add('d-none');
        }
         localStorage.setItem('editorTheme', theme); // Save preference
    };

    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-bs-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });

    // Load saved theme or detect OS preference on startup
    const savedTheme = localStorage.getItem('editorTheme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(initialTheme); // Apply the determined theme


    // --- Export Functionality ---
    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link); // Append to body for Firefox compatibility
        link.click();
        document.body.removeChild(link); // Clean up
        URL.revokeObjectURL(link.href); // Release object URL memory
    }

    document.getElementById('export-html').addEventListener('click', () => {
        downloadFile('index.html', htmlEditor.getValue(), 'text/html;charset=utf-8');
    });

    document.getElementById('export-css').addEventListener('click', () => {
        downloadFile('styles.css', cssEditor.getValue(), 'text/css;charset=utf-8');
    });

    document.getElementById('export-js').addEventListener('click', () => {
        downloadFile('script.js', jsEditor.getValue(), 'text/javascript;charset=utf-8');
    });

    document.getElementById('export-all').addEventListener('click', () => {
        const htmlCode = htmlEditor.getValue();
        const cssCode = cssEditor.getValue();
        const jsCode = jsEditor.getValue();

        // Construct the full HTML file content
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Project</title>
    <style>
/* --- CSS Code --- */
${cssCode}
    </style>
</head>
<body>
<!-- === HTML Code === -->
${htmlCode}

    <!-- === JavaScript Code === -->
    <script>
//<![CDATA[
${jsCode}
//]]>
    <\/script>
</body>
</html>`;
        downloadFile('project.html', fullHtml, 'text/html;charset=utf-8');
    });

     // --- Refresh CodeMirror on window resize ---
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
             // Only refresh if not in a maximized state where editors might be hidden
            if (!mainContainer.classList.contains('preview-maximized')) {
                Object.values(editors).forEach(editor => editor.refresh());
            }
        }, 250); // Debounce resize events
    });

    // --- Initial Actions ---
    updatePreview(); // Initial preview render on load
    previewMaximizeBtn.classList.add('maximize-internal'); // Set initial button class for CSS icon targeting

}); // End DOMContentLoaded
