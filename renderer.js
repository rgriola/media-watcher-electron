// filepath: /Users/rgriola/Desktop/01_Vibecode/WatchFolder/renderer.js

function addLogEntry(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    
    // Add timestamp
    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `<small>${timestamp}</small><br>${message}`;
    
    // Insert at the top (most recent first)
    logDiv.insertBefore(entry, logDiv.firstChild);
    
    // Keep only the last 100 entries to prevent memory issues
    while (logDiv.children.length > 100) {
        logDiv.removeChild(logDiv.lastChild);
    }
}

function updateStatus(message) {
    const statusBar = document.getElementById('statusBar');
    
    // Check if this is a status message (startup, watching, etc.)
    if (message.includes('Watching:') || 
        message.includes('Sorting to:') || 
        message.includes('File watcher is ready') ||
        message.includes('Media Watcher Started')) {
        
        const statusItem = document.createElement('div');
        statusItem.className = 'status-item';
        
        if (message.includes('Watching:')) {
            statusItem.innerHTML = `👁️ ${message}`;
            statusItem.className = 'status-item info';
        } else if (message.includes('Sorting to:')) {
            statusItem.innerHTML = `📂 ${message}`;
            statusItem.className = 'status-item info';
        } else if (message.includes('File watcher is ready')) {
            statusItem.innerHTML = `✅ File watcher is ready and monitoring for changes...`;
            statusItem.className = 'status-item';
        } else if (message.includes('Media Watcher Started')) {
            statusItem.innerHTML = `🎬 Media Watcher Started - Ready to process media files`;
            statusItem.className = 'status-item';
        }
        
        statusBar.appendChild(statusItem);
        return true; // Indicates this was handled as a status message
    }
    
    return false; // Not a status message
}

window.electronAPI.onLog((message, type) => {
    // Try to handle as status message first
    if (!updateStatus(message)) {
        // If not a status message, add to activity log
        addLogEntry(message, type);
    }
});

window.electronAPI.onStatus((message) => {
    updateStatus(message);
});

// Drag and Drop functionality
const dropArea = document.getElementById('dropArea');

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

// Highlight drop area when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

// Handle dropped files
dropArea.addEventListener('drop', handleDrop, false);

// Handle click to select files
dropArea.addEventListener('click', () => {
    window.electronAPI.selectFiles();
});

// Handle history button
document.getElementById('historyBtn').addEventListener('click', () => {
    window.electronAPI.openHistory();
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    dropArea.classList.add('dragover');
}

function unhighlight(e) {
    dropArea.classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    handleFiles(files);
}

function handleFiles(files) {
    const filePaths = [...files].map(file => file.path);
    
    // Show immediate feedback
    updateProgressDisplay({
        isProcessing: true,
        currentFile: '',
        processedCount: 0,
        totalCount: files.length,
        currentOperation: '📥 Preparing to process files...',
        startTime: new Date()
    });
    
    addLogEntry(`Processing ${files.length} dropped file(s)`, 'info');
    window.electronAPI.processDroppedFiles(filePaths);
}

window.electronAPI.onProgress((progressData) => {
    updateProgressDisplay(progressData);
});

function updateProgressDisplay(progressData) {
    const statusBar = document.getElementById('statusBar');
    
    if (progressData.isProcessing) {
        // Show progress information
        const percentage = progressData.totalCount > 0 ? 
            Math.round((progressData.processedCount / progressData.totalCount) * 100) : 0;
        
        // Calculate elapsed time
        let timeDisplay = '';
        if (progressData.startTime) {
            const elapsed = (new Date() - new Date(progressData.startTime)) / 1000;
            timeDisplay = `<span class="elapsed-time">${elapsed.toFixed(1)}s</span>`;
        }
        
        let statusHTML = `
            <div class="status-item">
                <div class="progress-info">
                    <span class="progress-operation">${progressData.currentOperation}</span>
                    <div class="progress-details">
                        <span class="progress-count">${progressData.processedCount}/${progressData.totalCount} files</span>
                        <span class="progress-percentage">${percentage}%</span>
                        ${timeDisplay}
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
        
        if (progressData.currentFile) {
            const fileName = progressData.currentFile.split(/[/\\]/).pop();
            statusHTML += `
                <div class="status-item info">
                    <span class="current-file">📄 ${fileName}</span>
                </div>
            `;
        }
        
        statusBar.innerHTML = statusHTML;
        
        // Also add to activity log for major operations
        if (progressData.currentOperation.includes('Scanning folder') || 
            progressData.currentOperation.includes('Starting processing')) {
            addLogEntry(progressData.currentOperation, 'info');
        }
    } else {
        // Processing complete or idle
        if (progressData.currentOperation) {
            statusBar.innerHTML = `
                <div class="status-item">
                    <span>${progressData.currentOperation}</span>
                </div>
            `;
            
            // Add completion message to log
            if (progressData.currentOperation.includes('Completed') || 
                progressData.currentOperation.includes('processed')) {
                addLogEntry(progressData.currentOperation, 'success');
            }
        } else {
            // Reset to ready state
            statusBar.innerHTML = `
                <div class="status-item">
                    <span>✅ Ready - Drop files or folders to process</span>
                </div>
            `;
        }
    }
}

// Initialize status display
updateProgressDisplay({
    isProcessing: false,
    currentFile: '',
    processedCount: 0,
    totalCount: 0,
    currentOperation: '',
    startTime: null
});