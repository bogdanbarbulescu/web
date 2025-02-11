// --- Utility Functions ---

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function enableDragAndDrop(editor) {
    const wrapper = editor.getWrapperElement();
    wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                editor.setValue(event.target.result);
            };
            reader.readAsText(file);
        }
    });
}

function exportCode(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// --- Editor Initialization ---

const savedTheme = localStorage.getItem('editorTheme') || 'default';

const htmlEditor = CodeMirror.fromTextArea(document.getElementById('html-editor'), {
    mode: 'htmlmixed',
    lineNumbers: true,
    theme: savedTheme
});
const cssEditor = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
    mode: 'css',
    lineNumbers: true,
    theme: savedTheme
});
const jsEditor = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
    mode: 'javascript',
    lineNumbers: true,
    theme: savedTheme
});

enableDragAndDrop(htmlEditor);
enableDragAndDrop(cssEditor);
enableDragAndDrop(jsEditor);

// Load saved code
htmlEditor.setValue(localStorage.getItem('code_html') || '');
cssEditor.setValue(localStorage.getItem('code_css') || '');
jsEditor.setValue(localStorage.getItem('code_js') || '');

// --- Preview Update ---

function updatePreview() {
    const htmlContent = htmlEditor.getValue();
    const cssContent = `<style>${cssEditor.getValue()}</style>`;
    const jsContent = `<script>${jsEditor.getValue()}<\/script>`;

    // Console capture script (modified for error handling)
    const consoleScript = `
        <script>
            (function() {
                function sendMessage(type, args, errorDetails) {
                    parent.postMessage({type: type, message: args, errorDetails: errorDetails}, '*');
                }
                const originalLog = console.log;
                const originalError = console.error;

                console.log = function(...args) {
                    sendMessage('log', args);
                    originalLog.apply(console, args);
                };
                console.error = function(...args) {
                    sendMessage('error', args);
                    originalError.apply(console, args);
                };

                window.onerror = function(message, source, lineno, colno, error) {
                   const errorDetails = {
                       message: message,
                       source: source,
                       lineno: lineno,
                       colno: colno,
                    };
                    sendMessage('error', [message], errorDetails);
                    return false; // Prevent default browser error handling

                };
            })();
        <\/script>`;

    const combinedContent = htmlContent + cssContent + consoleScript + jsContent;
    document.getElementById('preview').srcdoc = combinedContent;

    localStorage.setItem('code_html', htmlEditor.getValue());
    localStorage.setItem('code_css', cssEditor.getValue());
    localStorage.setItem('code_js', jsEditor.getValue());
}


const updatePreviewDebounced = debounce(updatePreview, 500);

htmlEditor.on('change', updatePreviewDebounced);
cssEditor.on('change', updatePreviewDebounced);
jsEditor.on('change', updatePreviewDebounced);


// --- Console Handling ---

const consoleDiv = document.getElementById('console');
const consoleToggle = document.getElementById('console-toggle');
const consoleContainer = document.getElementById('console-container');

function clearErrorMarks() {
    jsEditor.getAllMarks().forEach(mark => {
        if (mark.className === 'error-line') {
            mark.clear();
        }
    });
}

window.addEventListener('message', (event) => {
    const data = event.data;
    const msgEl = document.createElement('div');
    msgEl.textContent = `[${data.type.toUpperCase()}] ${data.message}`;

    // Check for existing error messages before appending
    let messageExists = false;
    for (let i = 0; i < consoleDiv.children.length; i++) {
        if (consoleDiv.children[i].textContent === msgEl.textContent) {
            messageExists = true;
            break;
        }
    }

    if (!messageExists) {
        consoleDiv.appendChild(msgEl);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    // Error Highlighting
    if (data.type === 'error' && data.errorDetails) {
        const { lineno, colno } = data.errorDetails;
         clearErrorMarks(); // Clear previous errors
        if (lineno) { // Check if lineno is defined
            jsEditor.markText(
                { line: lineno - 1, ch: colno -1 }, //CodeMirror lines are 0-indexed
                { line: lineno - 1, ch: Number.MAX_SAFE_INTEGER }, // Highlight to end of line
                { className: 'error-line' }
            );
        }
        //Maximize console if have errors
        consoleContainer.classList.add('maximized');
        consoleToggle.textContent = 'Minimize';
        consoleToggle.dataset.state = 'maximized';
    }
});

consoleToggle.addEventListener('click', () => {
    const currentState = consoleToggle.dataset.state;
    if (currentState === 'minimized') {
        consoleContainer.classList.add('maximized');
        consoleToggle.textContent = 'Minimize';
        consoleToggle.dataset.state = 'maximized';
    } else {
        consoleContainer.classList.remove('maximized');
        consoleToggle.textContent = 'Maximize';
        consoleToggle.dataset.state = 'minimized';
    }
    refreshAllCodeMirrors();
});

// --- Theme Selection ---

document.getElementById('theme-selector').addEventListener('change', function() {
    const newTheme = this.value;
    htmlEditor.setOption('theme', newTheme);
    cssEditor.setOption('theme', newTheme);
    jsEditor.setOption('theme', newTheme);
    localStorage.setItem('editorTheme', newTheme);
});

// --- Export Functionality ---
document.getElementById('export-html').addEventListener('click', () => exportCode('cod.html', htmlEditor.getValue()));
document.getElementById('export-css').addEventListener('click', () => exportCode('stil.css', cssEditor.getValue()));
document.getElementById('export-js').addEventListener('click', () => exportCode('script.js', jsEditor.getValue()));
document.getElementById('export-all').addEventListener('click', () => {
    const combined = htmlEditor.getValue() +
        `<style>${cssEditor.getValue()}</style>` +
        `<script>${jsEditor.getValue()}<\/script>`;
    exportCode('proiect.html', combined);
});

// --- Resizing ---
let currentResizer;
let currentEditor;

function startResize(e) {
    currentResizer = e.target;
    const targetId = currentResizer.dataset.target; // Get the ID of the textarea
    currentEditor = document.getElementById(targetId).nextElementSibling;  //Access to codemirror
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}


function doResize(e) {
    if (!currentEditor) return;
      // Prevent resizing if the panel is maximized
    if (currentEditor.closest('.editor-panel').classList.contains('maximized') ||
        currentEditor.closest('#preview-container').classList.contains('maximized') ) {
        return;
    }
    const rect = currentEditor.getBoundingClientRect(); // Get CodeMirror's dimensions
    const newWidth = e.clientX - rect.left;

    if (newWidth > 50) { // Minimum width
        currentEditor.style.width = `${newWidth}px`;
        // Trigger CodeMirror refresh *after* resizing the container
        const editorInstance = currentEditor.CodeMirror;
        if(editorInstance){
            editorInstance.refresh();
        }
    }
}

function stopResize() {
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    currentResizer = null;
    currentEditor = null;
}

// Attach resizer event listeners
document.querySelectorAll('.resizer').forEach(resizer => {
    resizer.addEventListener('mousedown', startResize);
});

// --- Maximize Functionality ---
function refreshAllCodeMirrors() {
    [htmlEditor, cssEditor, jsEditor].forEach(editor => {
        if (editor && editor.refresh) { // defensive check
            editor.refresh();
        }
    });
}


document.querySelectorAll('.maximize-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const targetId = e.target.dataset.target;
        const targetElement = document.getElementById(targetId);

         //Handle special cases
        let panel;
        if (targetId === 'preview-container') {
            panel = targetElement;
        } else {
            panel = targetElement.closest('.editor-panel');
        }
        // Toggle the 'maximized' class on the panel
        panel.classList.toggle('maximized');

        // Remove 'maximized' class from all other panels
        document.querySelectorAll('.editor-panel.maximized, #preview-container.maximized').forEach(otherPanel => {
            if (otherPanel !== panel) {
                otherPanel.classList.remove('maximized');
            }
        });

        // Refresh CodeMirror instances after maximizing/restoring
       refreshAllCodeMirrors()
    });
});
// --- Initial Update ---

updatePreview();