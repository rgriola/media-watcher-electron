/**
 * Media History Display
 * 
 * TIMEZONE HANDLING:
 * - Manifest stores all timestamps in UTC (ISO format) for consistency
 * - UI displays all dates/times in user's local timezone
 * - JavaScript Date constructor automatically converts UTC ISO strings to local time
 * - This approach supports professional camera workflows and multi-timezone scenarios
 */

let manifest = null;
let currentTab = 'videos';

// Load manifest data when page loads
window.addEventListener('DOMContentLoaded', async () => {
    console.log('History page loaded, attempting to get manifest...');
    console.log('electronAPI available:', !!window.electronAPI);
    console.log('getManifest function available:', !!window.electronAPI?.getManifest);
    
    try {
        const manifestArray = await window.electronAPI.getManifest();
        console.log('Raw manifest loaded:', manifestArray);
        
        // Convert array format to expected structure
        manifest = processManifestData(manifestArray);
        console.log('Processed manifest:', manifest);
        
        updateStats();
        displayFiles(currentTab);
        setupTabs();
    } catch (error) {
        console.error('Error loading manifest:', error);
        document.getElementById('content').innerHTML = '<div class="empty-message">Error loading history data: ' + error.message + '</div>';
    }
});

// Process the manifest array into the expected structure
function processManifestData(manifestArray) {
    const files = {
        videos: [],
        images: [],
        audio: []
    };
    
    const removed = [];
    let totalSize = 0;
    
    manifestArray.forEach(entry => {
        // Convert to expected format
        const fileData = {
            filename: entry.fileName,
            filePath: entry.sortedPath,
            originalPath: entry.originalPath,
            originalDropPath: entry.originalDropPath,
            sizeFormatted: formatBytes(entry.fileSize),
            dateAdded: entry.processedDate,
            importDate: entry.processedDate,
            dateCreated: entry.fileDate,
            metadata: entry.metadata
        };
        
        totalSize += entry.fileSize || 0;
        
        if (entry.removed) {
            removed.push({
                ...fileData,
                dateRemoved: entry.removedDate,
                originalType: entry.mediaType
            });
        } else {
            // Add to appropriate media type
            if (entry.mediaType === 'videos') {
                files.videos.push(fileData);
            } else if (entry.mediaType === 'images') {
                files.images.push(fileData);
            } else if (entry.mediaType === 'audio') {
                files.audio.push(fileData);
            }
        }
    });
    
    return {
        files: files,
        removed: removed,
        stats: {
            totalFiles: manifestArray.length - removed.length,
            totalSize: totalSize
        }
    };
}

function updateStats() {
    if (manifest && manifest.stats) {
        document.getElementById('totalFiles').textContent = manifest.stats.totalFiles || 0;
        document.getElementById('totalSize').textContent = formatBytes(manifest.stats.totalSize || 0);
        document.getElementById('removedFiles').textContent = (manifest.removed || []).length;
    } else {
        document.getElementById('totalFiles').textContent = '0';
        document.getElementById('totalSize').textContent = '0 Bytes';
        document.getElementById('removedFiles').textContent = '0';
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            currentTab = tab.dataset.type;
            displayFiles(currentTab);
        });
    });
}

function displayFiles(type) {
    const content = document.getElementById('content');
    
    if (type === 'removed') {
        displayRemovedFiles();
        return;
    }
    
    const files = manifest.files[type] || [];
    
    if (files.length === 0) {
        content.innerHTML = `<div class="empty-message">No ${type} files found</div>`;
        return;
    }
    
    // Sort files by import date (most recent first)
    files.sort((a, b) => new Date(b.importDate || b.dateAdded) - new Date(a.importDate || a.dateAdded));
    
    // For files that were bulk-imported during startup (have very similar importDate timestamps),
    // use the file creation date for better grouping, but only for old files
    const processedFiles = files.map(file => {
        const importDate = new Date(file.importDate || file.dateAdded);
        const dateCreated = new Date(file.dateCreated);
        const now = new Date();
        
        // Calculate time differences
        const importedHoursAgo = (now - importDate) / (1000 * 60 * 60);
        const createdDaysAgo = Math.abs(now - dateCreated) / (1000 * 60 * 60 * 24);
        
        // Only use dateCreated for grouping if:
        // 1. File was "detected on startup" (not actively imported)
        // 2. File was imported more than 1 hour ago (bulk scan)
        // 3. File was created more than 1 day ago (existing file)
        if (file.originalPath && 
            file.originalPath.includes('detected on startup') && 
            importedHoursAgo > 1 && 
            createdDaysAgo > 1) {
            return { ...file, groupingDate: file.dateCreated };
        }
        
        // For all other files (newly imported), always use importDate
        return { ...file, groupingDate: file.importDate || file.dateAdded };
    });
    
    // Group files by their computed grouping date
    const filesByDate = groupFilesByDateCustom(processedFiles);
    
    let html = '';
    for (const [dateKey, dateFiles] of filesByDate) {
        html += `
            <div class="date-group">
                <div class="date-header">
                    <span class="date-icon">📅</span>
                    <span class="date-label">${formatDateHeader(dateKey)}</span>
                    <span class="file-count">(${dateFiles.length} files)</span>
                </div>
                <div class="files-in-date">
        `;
        
        dateFiles.forEach(file => {
            // Determine if this is a video file to show timecode info
            const isVideo = file.filePath && (file.filePath.includes('/videos/') || 
                           file.filename && /\.(mp4|mov|avi|mkv|mxf)$/i.test(file.filename));
            
            let additionalInfo = '';
            if (isVideo && file.metadata) {
                // Add duration info
                if (file.metadata.duration) {
                    const duration = formatDuration(file.metadata.duration);
                    additionalInfo += `<span class="detail-item">⏱️ Duration: ${duration}</span>`;
                }
                
                // Add timecode info if available
                if (file.metadata.timecode?.startTimecode) {
                    additionalInfo += `<span class="detail-item">🎬 Start TC: ${file.metadata.timecode.startTimecode}</span>`;
                }
                
                if (file.metadata.timecode?.endTimecode) {
                    additionalInfo += `<span class="detail-item">🏁 End TC: ${file.metadata.timecode.endTimecode}</span>`;
                }
                
                // Add professional camera info
                if (file.metadata.tags?.recordedDate) {
                    additionalInfo += `<span class="detail-item">🎥 Shot: ${formatDate(file.metadata.tags.recordedDate)}</span>`;
                }
                
                if (file.metadata.tags?.productName) {
                    additionalInfo += `<span class="detail-item">📹 Camera: ${file.metadata.tags.productName} ${file.metadata.tags.productVersion || ''}</span>`;
                }
                
                if (file.metadata.tags?.reel) {
                    additionalInfo += `<span class="detail-item">🎞️ Reel: ${file.metadata.tags.reel}</span>`;
                }
                
                if (file.metadata.tags?.scene || file.metadata.tags?.take) {
                    const sceneInfo = [file.metadata.tags.scene, file.metadata.tags.take].filter(Boolean).join('/');
                    if (sceneInfo) {
                        additionalInfo += `<span class="detail-item">🎬 Scene/Take: ${sceneInfo}</span>`;
                    }
                }
                
                // Add resolution for videos
                if (file.metadata.video?.width && file.metadata.video?.height) {
                    additionalInfo += `<span class="detail-item">📺 ${file.metadata.video.width}x${file.metadata.video.height} (${file.metadata.video.quality || 'Unknown'})</span>`;
                }
                
                // Add camera UID for professional workflows
                if (file.cameraUID) {
                    additionalInfo += `<span class="detail-item" title="Camera UID: ${file.cameraUID}">🆔 Camera ID</span>`;
                }
            }
            
            html += `
                <div class="file-item">
                    <div class="file-info">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-details">
                            <span class="detail-item">📥 Imported: ${formatTimeOnly(file.importDate || file.dateAdded)}</span>
                            <span class="detail-item">📁 Size: ${file.sizeFormatted}</span>
                            <span class="detail-item">🗓️ Created: ${formatDate(file.dateCreated)}</span>
                            ${additionalInfo}
                            <span class="detail-item">📍 Source: <span class="original-path" title="${file.originalPath || 'Unknown'}">${truncatePath(file.originalPath || 'Unknown')}</span></span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function displayRemovedFiles() {
    const content = document.getElementById('content');
    const removed = manifest.removed || [];
    
    if (removed.length === 0) {
        content.innerHTML = '<div class="empty-message">No removed files</div>';
        return;
    }
    
    // Sort by removal date (most recent first)
    removed.sort((a, b) => new Date(b.dateRemoved) - new Date(a.dateRemoved));
    
    // Group files by removal date
    const filesByDate = groupFilesByDate(removed, 'dateRemoved');
    
    let html = '';
    for (const [dateKey, dateFiles] of filesByDate) {
        html += `
            <div class="date-group">
                <div class="date-header removed-header">
                    <span class="date-icon">🗑️</span>
                    <span class="date-label">Removed on ${formatDateHeader(dateKey)}</span>
                    <span class="file-count">(${dateFiles.length} files)</span>
                </div>
                <div class="files-in-date">
        `;
        
        dateFiles.forEach(file => {
            html += `
                <div class="file-item removed">
                    <div class="file-info">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-details">
                            <span class="detail-item">🗑️ Removed: ${formatTimeOnly(file.dateRemoved)}</span>
                            <span class="detail-item">📁 Size: ${file.sizeFormatted}</span>
                            <span class="detail-item">� Imported: ${formatDate(file.importDate || file.dateAdded)}</span>
                            <span class="detail-item">📂 Was in: ${file.originalType}</span>
                            <span class="detail-item">📍 Source: <span class="original-path" title="${file.originalPath || 'Unknown'}">${truncatePath(file.originalPath || 'Unknown')}</span></span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function formatDate(dateString) {
    // Convert UTC timestamp from manifest to local time for display
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function formatTimeOnly(dateString) {
    // Convert UTC timestamp from manifest to local time for display
    const date = new Date(dateString);
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function formatDateHeader(dateKey) {
    const today = new Date();
    const date = new Date(dateKey);
    
    // Compare using local date strings to avoid timezone issues
    // Both dates are already in local time for comparison
    const todayDateString = today.toDateString();
    const fileDateString = date.toDateString();
    
    // Check if it's today
    if (fileDateString === todayDateString) {
        return `TODAY - ${date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })}`;
    }
    
    // Check if it's yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateString = yesterday.toDateString();
    if (fileDateString === yesterdayDateString) {
        return `YESTERDAY - ${date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })}`;
    }
    
    // Check if it's within the last week
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (date > oneWeekAgo) {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    // Older dates
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function groupFilesByDate(files, dateField = 'dateAdded') {
    const groups = new Map();
    
    files.forEach(file => {
        // Convert UTC timestamp from manifest to local date for grouping
        // JavaScript Date constructor automatically converts ISO strings (UTC) to local time
        const date = new Date(file[dateField]);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        if (!groups.has(dateKey)) {
            groups.set(dateKey, []);
        }
        groups.get(dateKey).push(file);
    });
    
    // Sort each group by time within the day (most recent first)
    for (const [dateKey, dateFiles] of groups.entries()) {
        dateFiles.sort((a, b) => new Date(b[dateField]) - new Date(a[dateField]));
    }
    
    // Convert to array and sort by date (most recent first)
    return Array.from(groups.entries()).sort((a, b) => {
        return new Date(b[0]) - new Date(a[0]);
    });
}

function groupFilesByDateCustom(files) {
    const groups = new Map();
    
    files.forEach(file => {
        // Convert UTC timestamp from manifest to local date for grouping
        // JavaScript Date constructor automatically converts ISO strings (UTC) to local time
        const date = new Date(file.groupingDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        if (!groups.has(dateKey)) {
            groups.set(dateKey, []);
        }
        groups.get(dateKey).push(file);
    });
    
    // Sort each group by time within the day (most recent first)
    for (const [dateKey, dateFiles] of groups.entries()) {
        dateFiles.sort((a, b) => new Date(b.groupingDate) - new Date(a.groupingDate));
    }
    
    // Convert to array and sort by date (most recent first)
    return Array.from(groups.entries()).sort((a, b) => {
        return new Date(b[0]) - new Date(a[0]);
    });
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function truncatePath(fullPath) {
    if (!fullPath) return 'Unknown';
    if (fullPath.length <= 50) return fullPath;
    return '...' + fullPath.slice(-47);
}
