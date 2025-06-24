/**
 * Media Sorting Electron App
 * 
 * TIMEZONE HANDLING:
 * - All timestamps in manifest are stored in UTC (ISO format) for consistency
 * - UI converts UTC to local time for display and grouping
 * - This approach supports professional camera workflows and XML metadata
 * - Future enhancement: Parse camera XML metadata with proper timezone handling
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs-extra');
const exifr = require('exifr');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const { spawn } = require('child_process');

const WATCHED_DIR = path.join(__dirname, 'watched-folder');
const DEST_DIR = path.join(__dirname, 'sorted-media');
const MANIFEST_FILE = path.join(__dirname, 'media-history.json');

const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.mkv', '.mxf'];
const AUDIO_EXT = ['.mp3', '.wav', '.aac', '.flac'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.arw'];

let win;
let historyWin;
let watcher;

// Progress tracking
let currentProgress = {
    isProcessing: false,
    currentFile: '',
    processedCount: 0,
    totalCount: 0,
    currentOperation: '',
    startTime: null
};

// Helper function to send log messages to renderer
function sendLogMessage(message, type = 'info') {
    if (win && !win.isDestroyed()) {
        win.webContents.send('log-message', { message, type, timestamp: new Date() });
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Helper function to send progress updates to renderer
function sendProgressUpdate(update = {}) {
    const progressData = { ...currentProgress, ...update };
    currentProgress = progressData;
    
    if (win && !win.isDestroyed()) {
        win.webContents.send('progress-update', progressData);
    }
    
    // Also log major progress milestones
    if (update.currentFile) {
        sendLogMessage(`${progressData.currentOperation}: ${path.basename(update.currentFile)} (${progressData.processedCount}/${progressData.totalCount})`, 'info');
    }
}

// Start watching the watched folder
function startWatching() {
    if (!fs.existsSync(WATCHED_DIR)) {
        fs.ensureDirSync(WATCHED_DIR);
        sendLogMessage('📁 Created watched-folder directory', 'info');
    }
    if (!fs.existsSync(DEST_DIR)) {
        fs.ensureDirSync(DEST_DIR);
        sendLogMessage('📁 Created sorted-media directory', 'info');
    }

    watcher = chokidar.watch(WATCHED_DIR, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
    });

    watcher.on('add', async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if ([...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(ext)) {
            try {
                await processMediaFile(filePath);
                // Note: We copy files, don't remove them from watched folder
                // await fs.remove(filePath); // Commented out to preserve original files
            } catch (error) {
                sendLogMessage(`❌ Error: ${error.message}`, 'error');
            }
        }
    });

    watcher.on('ready', () => {
        sendLogMessage('👀 Watching for new media files...', 'success');
    });

    watcher.on('error', (error) => {
        sendLogMessage(`❌ Watcher error: ${error.message}`, 'error');
    });
}

// Create the main application window
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false // Allow file:// access for media files
        },
        icon: path.join(__dirname, 'icon.png'), // Add icon if you have one
        show: false // Don't show until ready-to-show
    });

    // Load the main HTML file
    win.loadFile('index.html');

    // Show window when ready
    win.once('ready-to-show', () => {
        win.show();
        sendLogMessage('🎬 Media Watcher is ready!', 'success');
    });

    // Handle window closed
    win.on('closed', () => {
        win = null;
        if (watcher) {
            watcher.close();
        }
    });

    // Enable file drag and drop
    setupDropHandling();
}

// Create history window
function createHistoryWindow() {
    if (historyWin) {
        historyWin.focus();
        return;
    }

    historyWin = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: win,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    historyWin.loadFile('history.html');

    historyWin.on('closed', () => {
        historyWin = null;
    });
}

// Setup drag and drop handling
function setupDropHandling() {
    win.webContents.on('dom-ready', () => {
        // Enable drag and drop
        win.webContents.executeJavaScript(`
            document.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            document.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files).map(f => f.path);
                window.electronAPI.processDroppedFiles(files);
            });
        `);
    });
}

// Enhanced ffprobe function using direct command execution
async function runFFprobeCommand(filePath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-show_entries', 'format:format_tags:stream:stream_tags',
            filePath
        ];
        
        const ffprobe = spawn(ffprobeStatic.path, args);
        let stdout = '';
        let stderr = '';
        
        ffprobe.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        ffprobe.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ffprobe.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`FFprobe failed: ${stderr}`));
            } else {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (parseError) {
                    reject(new Error(`Failed to parse FFprobe output: ${parseError.message}`));
                }
            }
        });
    });
}

// Function to read video/audio metadata
async function readVideoMetadata(filePath) {
    try {
        const mediaType = getMediaType(filePath);
        if (mediaType !== 'videos' && mediaType !== 'audio') {
            return null; // Only process video and audio files
        }

        // Use enhanced ffprobe to extract metadata with all available options
        const info = await runFFprobeCommand(filePath);
        
        if (!info) {
            return null;
        }

        // Extract general file information
        const format = info.format || {};
        const videoStream = info.streams?.find(stream => stream.codec_type === 'video');
        const audioStream = info.streams?.find(stream => stream.codec_type === 'audio');

        const metadata = {
            // General file info
            duration: parseFloat(format.duration) || null,
            size: parseInt(format.size) || null,
            bitRate: parseInt(format.bit_rate) || null,
            formatName: format.format_name || null,
            formatLongName: format.format_long_name || null,
            startTime: parseFloat(format.start_time) || null,
            
            // Timecode information (critical for professional workflows)
            timecode: {
                // Primary timecode from format tags (multiple possible locations)
                startTimecode: format.tags?.timecode || 
                              format.tags?.time_code || 
                              format.tags?.tc ||
                              format.tags?.start_timecode ||
                              format.tags?.TIMECODE ||
                              format.tags?.creation_time_timecode ||
                              format.tags?.material_package_timecode ||
                              // Also check in streams for timecode tracks
                              info.streams?.find(s => s.tags?.timecode)?.tags?.timecode || null,
                
                // Duration-based end timecode calculation
                duration: parseFloat(format.duration) || null,
                
                // Frame rate for timecode calculations (handle fractional rates properly)
                frameRate: videoStream?.r_frame_rate || videoStream?.avg_frame_rate || null,
                
                // Timecode format info
                dropFrame: format.tags?.drop_frame || 
                          format.tags?.drop_frame_flag ||
                          // Detect drop frame from semicolon separator
                          (format.tags?.timecode && format.tags.timecode.includes(';')) || null,
                
                // Additional timecode sources
                altTimecode: format.tags?.alt_timecode || null,
                sourceTimecode: format.tags?.source_timecode || null,
                creationTimecode: format.tags?.creation_time_timecode || null,
                
                // Check for dedicated timecode track
                timecodeTrack: info.streams?.find(stream => 
                    stream.codec_type === 'data' && 
                    (stream.codec_name === 'smpte_timecode' || 
                     stream.codec_name === 'timecode' ||
                     stream.tags?.timecode)
                ) || null,
                
                // Raw format tags for debugging
                allTimecodeFields: Object.keys(format.tags || {})
                    .filter(key => key.toLowerCase().includes('timecode') || key.toLowerCase().includes('time_code'))
                    .reduce((obj, key) => {
                        obj[key] = format.tags[key];
                        return obj;
                    }, {})
            },
            
            // Creation/modification dates from metadata
            creationTime: format.tags?.creation_time || null,
            
            // Video stream info (if present)
            video: videoStream ? {
                codec: videoStream.codec_name || null,
                codecLongName: videoStream.codec_long_name || null,
                width: videoStream.width || null,
                height: videoStream.height || null,
                aspectRatio: videoStream.display_aspect_ratio || null,
                frameRate: videoStream.r_frame_rate || null,
                avgFrameRate: videoStream.avg_frame_rate || null,
                pixelFormat: videoStream.pix_fmt || null,
                colorSpace: videoStream.color_space || null,
                colorRange: videoStream.color_range || null,
                bitRate: parseInt(videoStream.bit_rate) || null
            } : null,
            
            // Audio stream info (if present)
            audio: audioStream ? {
                codec: audioStream.codec_name || null,
                codecLongName: audioStream.codec_long_name || null,
                sampleRate: parseInt(audioStream.sample_rate) || null,
                channels: audioStream.channels || null,
                channelLayout: audioStream.channel_layout || null,
                bitRate: parseInt(audioStream.bit_rate) || null,
                bitsPerSample: audioStream.bits_per_sample || null
            } : null,
            
            // Metadata tags (camera/device specific)
            tags: {
                // Common tags
                title: format.tags?.title || null,
                artist: format.tags?.artist || null,
                album: format.tags?.album || null,
                date: format.tags?.date || null,
                genre: format.tags?.genre || null,
                comment: format.tags?.comment || null,
                
                // Camera/device specific tags
                make: format.tags?.make || null,
                model: format.tags?.model || null,
                software: format.tags?.software || null,
                encoder: format.tags?.encoder || null,
                
                // Professional camera metadata
                productName: format.tags?.product_name || null,
                productVersion: format.tags?.product_version || null,
                productUID: format.tags?.product_uid || null,
                
                // CRITICAL: Actual recording/shooting date from camera
                recordedDate: format.tags?.modification_date || null, // This is when it was actually shot!
                shootingDate: format.tags?.modification_date || null,  // Alias for clarity
                
                // Professional identifiers
                materialPackageUMID: format.tags?.material_package_umid || null,
                packageUID: format.tags?.package_uid || null,
                
                // Professional camera tags (common in .MXF, .MOV files)
                reel: format.tags?.reel || null,
                scene: format.tags?.scene || null,
                take: format.tags?.take || null,
                angle: format.tags?.angle || format.tags?.camera_angle || null,
                
                // Location data (if available)
                location: format.tags?.location || null,
                gpsCoordinates: format.tags?.['com.apple.quicktime.location.ISO6709'] || null,
                
                // Other metadata
                copyright: format.tags?.copyright || null,
                description: format.tags?.description || null,
                keywords: format.tags?.keywords || null
            },
            
            // All streams info (for advanced users)
            streamsCount: info.streams?.length || 0,
            streams: info.streams?.map(stream => ({
                index: stream.index,
                codecType: stream.codec_type,
                codecName: stream.codec_name,
                duration: parseFloat(stream.duration) || null
            })) || []
        };

        // Convert creation time to UTC if available
        if (metadata.creationTime) {
            try {
                metadata.creationTimeUTC = new Date(metadata.creationTime).toISOString();
            } catch (e) {
                metadata.creationTimeUTC = null;
            }
        }

        // Calculate video quality/resolution category
        if (metadata.video) {
            const width = metadata.video.width;
            const height = metadata.video.height;
            
            if (width >= 3840 || height >= 2160) {
                metadata.video.quality = '4K/UHD';
            } else if (width >= 1920 || height >= 1080) {
                metadata.video.quality = '1080p/FHD';
            } else if (width >= 1280 || height >= 720) {
                metadata.video.quality = '720p/HD';
            } else if (width >= 640 || height >= 480) {
                metadata.video.quality = '480p/SD';
            } else {
                metadata.video.quality = 'Low Resolution';
            }
        }

        // Calculate end timecode if we have start timecode and duration
        if (metadata.timecode.startTimecode && metadata.timecode.duration) {
            metadata.timecode.endTimecode = calculateEndTimecode(
                metadata.timecode.startTimecode, 
                metadata.timecode.duration, 
                metadata.timecode.frameRate
            );
        }

        return metadata;
    } catch (error) {
        console.error(`Error reading video metadata from ${filePath}:`, error);
        return null;
    }
}

// Helper function to calculate end timecode
function calculateEndTimecode(startTimecode, durationSeconds, frameRateString) {
    try {
        // Parse frame rate from string like "29.97/1" or "30000/1001"
        let frameRate = 30; // default
        if (frameRateString) {
            if (frameRateString.includes('/')) {
                const [num, den] = frameRateString.split('/').map(parseFloat);
                frameRate = num / den;
            } else {
                frameRate = parseFloat(frameRateString);
            }
        }
        
        // Parse start timecode (HH:MM:SS:FF or HH:MM:SS.mmm format)
        let startFrames = 0;
        if (startTimecode.includes(':')) {
            const parts = startTimecode.split(':');
            if (parts.length >= 3) {
                const hours = parseInt(parts[0]) || 0;
                const minutes = parseInt(parts[1]) || 0;
                const seconds = parseFloat(parts[2]) || 0;
                
                // Convert to total seconds
                const totalStartSeconds = hours * 3600 + minutes * 60 + seconds;
                startFrames = Math.round(totalStartSeconds * frameRate);
            }
        }
        
        // Add duration in frames
        const durationFrames = Math.round(durationSeconds * frameRate);
        const endFrames = startFrames + durationFrames;
        
        // Convert back to timecode
        const endTotalSeconds = endFrames / frameRate;
        const endHours = Math.floor(endTotalSeconds / 3600);
        const endMinutes = Math.floor((endTotalSeconds % 3600) / 60);
        const endSecondsRemainder = endTotalSeconds % 60;
        const endFrameNumber = Math.round((endSecondsRemainder % 1) * frameRate);
        const endSecondsWhole = Math.floor(endSecondsRemainder);
        
        // Format as HH:MM:SS:FF
        return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSecondsWhole).padStart(2, '0')}:${String(endFrameNumber).padStart(2, '0')}`;
        
    } catch (error) {
        console.error('Error calculating end timecode:', error);
        return null;
    }
}

// Function to read image metadata (EXIF data)
async function readImageMetadata(filePath) {
    try {
        const mediaType = getMediaType(filePath);
        if (mediaType !== 'images') {
            return null; // Only process image files
        }

        // Read EXIF data from the image
        const exifData = await exifr.parse(filePath, {
            // Include common metadata fields
            tiff: true,        // Basic TIFF tags
            exif: true,        // EXIF tags  
            gps: true,         // GPS coordinates
            iptc: true,        // IPTC metadata
            icc: true,         // Color profile
            jfif: true,        // JFIF data
            ihdr: true,        // PNG header
            pick: [            // Specific fields we want
                'Make', 'Model', 'Software',
                'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
                'CreateDate', 'ModifyDate',
                'ISO', 'FNumber', 'ExposureTime', 'FocalLength',
                'WhiteBalance', 'Flash', 'Orientation',
                'ImageWidth', 'ImageHeight',
                'ColorSpace', 'ExifImageWidth', 'ExifImageHeight',
                'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
                'Artist', 'Copyright', 'ImageDescription',
                'XResolution', 'YResolution', 'ResolutionUnit'
            ]
        });

        if (!exifData) {
            return null;
        }

        // Format the metadata for storage
        const metadata = {
            // Camera/Device Info
            make: exifData.Make || null,
            model: exifData.Model || null,
            software: exifData.Software || null,
            
            // Date/Time Information (most important for your workflow!)
            dateTimeOriginal: exifData.DateTimeOriginal || exifData.CreateDate || null,
            dateTimeDigitized: exifData.DateTimeDigitized || null,
            dateTime: exifData.DateTime || exifData.ModifyDate || null,
            
            // Camera Settings
            iso: exifData.ISO || null,
            fNumber: exifData.FNumber || null,
            exposureTime: exifData.ExposureTime || null,
            focalLength: exifData.FocalLength || null,
            whiteBalance: exifData.WhiteBalance || null,
            flash: exifData.Flash || null,
            
            // Image Properties
            orientation: exifData.Orientation || null,
            imageWidth: exifData.ImageWidth || exifData.ExifImageWidth || null,
            imageHeight: exifData.ImageHeight || exifData.ExifImageHeight || null,
            colorSpace: exifData.ColorSpace || null,
            
            // GPS Information
            gpsLatitude: exifData.GPSLatitude || null,
            gpsLongitude: exifData.GPSLongitude || null,
            gpsAltitude: exifData.GPSAltitude || null,
            
            // Other
            artist: exifData.Artist || null,
            copyright: exifData.Copyright || null,
            imageDescription: exifData.ImageDescription || null,
            xResolution: exifData.XResolution || null,
            yResolution: exifData.YResolution || null,
            resolutionUnit: exifData.ResolutionUnit || null
        };

        // Convert dates to UTC ISO strings for consistency
        if (metadata.dateTimeOriginal) {
            try {
                metadata.dateTimeOriginalUTC = new Date(metadata.dateTimeOriginal).toISOString();
            } catch (e) {
                metadata.dateTimeOriginalUTC = null;
            }
        }
        
        if (metadata.dateTimeDigitized) {
            try {
                metadata.dateTimeDigitizedUTC = new Date(metadata.dateTimeDigitized).toISOString();
            } catch (e) {
                metadata.dateTimeDigitizedUTC = null;
            }
        }
        
        if (metadata.dateTime) {
            try {
                metadata.dateTimeUTC = new Date(metadata.dateTime).toISOString();
            } catch (e) {
                metadata.dateTimeUTC = null;
            }
        }

        return metadata;
    } catch (error) {
        console.error(`Error reading metadata from ${filePath}:`, error);
        return null;
    }
}

// Helper function for future camera metadata processing
function parseTimestampToUTC(timestamp, timezone = null) {
    // For future use with professional camera XML metadata
    // Currently all file timestamps are converted to UTC using toISOString()
    if (timezone) {
        // TODO: Handle timezone-aware timestamp parsing from camera XML
        // This would be needed for cameras that embed timezone info in metadata
        return new Date(timestamp).toISOString();
    }
    return new Date(timestamp).toISOString();
}

// Utility function to format file sizes
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to determine media type based on file extension
function getMediaType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (VIDEO_EXT.includes(ext)) return 'videos';
    if (AUDIO_EXT.includes(ext)) return 'audio';
    if (IMAGE_EXT.includes(ext)) return 'images';
    return null;
}

// Process a single media file (used by drag & drop and file watcher)
async function processMediaFile(filePath, originalDropPath = null) {
    console.log('🔧 DEBUG: processMediaFile called with:', filePath);
    if (originalDropPath) {
        console.log('🔧 DEBUG: Original drop path:', originalDropPath);
    }
    
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stats = await fs.stat(filePath);
    
    // Update progress
    sendProgressUpdate({
        currentFile: filePath,
        currentOperation: '📄 Processing file'
    });
    
    sendLogMessage(`📄 Processing: ${fileName}`, 'info');
    sendProgressUpdate({
        isProcessing: true,
        currentFile: filePath,
        processedCount: 0,
        totalCount: 0,
        currentOperation: 'Processing file'
    });
    
    // Determine media type and read metadata
    const mediaType = getMediaType(filePath);
    console.log('🔧 DEBUG: Media type detected:', mediaType);
    
    if (!mediaType) {
        sendLogMessage(`❌ Unsupported file type: ${ext}`, 'error');
        return;
    }
    
    let metadata = null;
    
    // Update progress for metadata extraction
    sendProgressUpdate({
        currentFile: filePath,
        currentOperation: '🔍 Reading metadata'
    });
    
    if (mediaType === 'videos' || mediaType === 'audio') {
        metadata = await readVideoMetadata(filePath);
    } else if (mediaType === 'images') {
        metadata = await readImageMetadata(filePath);
    }
    
    // Create date-based folder structure
    const fileDate = new Date(stats.mtime);
    const year = fileDate.getFullYear();
    const month = String(fileDate.getMonth() + 1).padStart(2, '0');
    const day = String(fileDate.getDate()).padStart(2, '0');
    
    const destFolder = path.join(DEST_DIR, mediaType, `${year}-${month}-${day}`);
    console.log('🔧 DEBUG: Destination folder:', destFolder);
    
    await fs.ensureDir(destFolder);
    
    const destPath = path.join(destFolder, fileName);
    console.log('🔧 DEBUG: Copying from', filePath, 'to', destPath);
    
    // Update progress for file copying
    sendProgressUpdate({
        currentFile: filePath,
        currentOperation: '📁 Copying file'
    });
    
    // Copy file to sorted location
    await fs.copy(filePath, destPath);
    
    // Save to manifest
    const manifestEntry = {
        fileName,
        originalPath: filePath,
        originalDropPath: originalDropPath || filePath, // Track where the drop originally came from
        sortedPath: destPath,
        fileSize: stats.size,
        processedDate: new Date().toISOString(),
        fileDate: fileDate.toISOString(),
        mediaType,
        metadata
    };
    
    console.log('🔧 DEBUG: Saving to manifest:', manifestEntry);
    await saveToManifest(manifestEntry);
    
    // Update progress - file completed
    sendProgressUpdate({
        processedCount: currentProgress.processedCount + 1,
        currentOperation: '✅ File completed'
    });
    
    sendLogMessage(`✅ Sorted: ${fileName} → ${mediaType}/${year}-${month}-${day}/`, 'success');
}

// Save file info to manifest
async function saveToManifest(fileInfo) {
    console.log('🔧 DEBUG: saveToManifest called with:', fileInfo.fileName);
    
    try {
        let manifest = [];
        
        if (await fs.pathExists(MANIFEST_FILE)) {
            const data = await fs.readFile(MANIFEST_FILE, 'utf8');
            manifest = JSON.parse(data);
            console.log('🔧 DEBUG: Loaded existing manifest with', manifest.length, 'entries');
        } else {
            console.log('🔧 DEBUG: Creating new manifest file');
        }
        
        manifest.push(fileInfo);
        await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
        
        console.log('🔧 DEBUG: Saved to manifest. Total entries:', manifest.length);
        sendLogMessage(`📝 Added to manifest: ${fileInfo.fileName}`, 'info');
        
    } catch (error) {
        console.error('🔧 DEBUG: Error saving to manifest:', error);
        sendLogMessage(`❌ Failed to save to manifest: ${error.message}`, 'error');
        throw error;
    }
}

// Load manifest for history view
async function loadManifest() {
    try {
        if (await fs.pathExists(MANIFEST_FILE)) {
            const data = await fs.readFile(MANIFEST_FILE, 'utf8');
            const manifest = JSON.parse(data);
            console.log('🔧 DEBUG: Loaded manifest with', manifest.length, 'entries');
            return manifest;
        }
        console.log('🔧 DEBUG: No manifest file found, returning empty array');
        return [];
    } catch (error) {
        console.error('🔧 DEBUG: Error loading manifest:', error);
        sendLogMessage(`❌ Error loading manifest: ${error.message}`, 'error');
        return [];
    }
}

// Initialize the app - create directories and manifest if needed
async function initializeApp() {
    console.log('🔧 DEBUG: Initializing app...');
    
    // Create base directories if they don't exist
    const dirsToCreate = [
        WATCHED_DIR,
        DEST_DIR,
        path.join(DEST_DIR, 'videos'),
        path.join(DEST_DIR, 'images'), 
        path.join(DEST_DIR, 'audio')
    ];
    
    for (const dir of dirsToCreate) {
        if (!await fs.pathExists(dir)) {
            await fs.ensureDir(dir);
            sendLogMessage(`📁 Created directory: ${path.basename(dir)}`, 'info');
            console.log('🔧 DEBUG: Created directory:', dir);
        }
    }
    
    // Create manifest file if it doesn't exist
    if (!await fs.pathExists(MANIFEST_FILE)) {
        await fs.writeFile(MANIFEST_FILE, '[]');
        sendLogMessage('📝 Created new manifest file', 'info');
        console.log('🔧 DEBUG: Created manifest file:', MANIFEST_FILE);
    }
    
    // Scan existing files and update manifest
    await scanAndUpdateManifest();
}

// Scan sorted-media folders and compare with manifest
async function scanAndUpdateManifest() {
    console.log('🔧 DEBUG: Scanning existing files...');
    
    try {
        const manifest = await loadManifest();
        const existingFiles = new Set();
        
        // Scan all media type folders
        const mediaTypes = ['videos', 'images', 'audio'];
        
        for (const mediaType of mediaTypes) {
            const mediaDir = path.join(DEST_DIR, mediaType);
            if (await fs.pathExists(mediaDir)) {
                const subDirs = await fs.readdir(mediaDir);
                
                for (const subDir of subDirs) {
                    const fullSubDir = path.join(mediaDir, subDir);
                    const stat = await fs.stat(fullSubDir);
                    
                    if (stat.isDirectory()) {
                        const files = await fs.readdir(fullSubDir);
                        
                        for (const file of files) {
                            const filePath = path.join(fullSubDir, file);
                            const fileStat = await fs.stat(filePath);
                            
                            if (fileStat.isFile()) {
                                existingFiles.add(filePath);
                            }
                        }
                    }
                }
            }
        }
        
        // Mark missing files as removed in manifest
        let updatedManifest = false;
        for (const entry of manifest) {
            if (entry.sortedPath && !existingFiles.has(entry.sortedPath)) {
                if (!entry.removed) {
                    entry.removed = true;
                    entry.removedDate = new Date().toISOString();
                    updatedManifest = true;
                    console.log('🔧 DEBUG: Marked as removed:', entry.fileName);
                }
            }
        }
        
        // Save updated manifest if changes were made
        if (updatedManifest) {
            await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
            sendLogMessage('📝 Updated manifest with missing files', 'info');
        }
        
        console.log('🔧 DEBUG: Scan complete. Found', existingFiles.size, 'existing files');
        
    } catch (error) {
        console.error('🔧 DEBUG: Error scanning files:', error);
        sendLogMessage(`❌ Error scanning existing files: ${error.message}`, 'error');
    }
}

// Process a folder recursively to find media files
// Helper function to count media files in a folder recursively
async function countMediaFiles(folderPath) {
    let count = 0;
    try {
        const items = await fs.readdir(folderPath);
        
        for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
                count += await countMediaFiles(itemPath);
            } else if (stats.isFile()) {
                const ext = path.extname(itemPath).toLowerCase();
                if ([...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(ext)) {
                    count++;
                }
            }
        }
    } catch (error) {
        console.error('Error counting files:', error);
    }
    return count;
}

async function processFolder(folderPath, originalDropPath = null) {
    console.log('🔧 DEBUG: processFolder called with:', folderPath);
    
    // First, count all media files for progress tracking
    const totalFiles = await countMediaFiles(folderPath);
    
    // Initialize progress tracking
    sendProgressUpdate({
        isProcessing: true,
        currentFile: '',
        processedCount: 0,
        totalCount: totalFiles,
        currentOperation: `📁 Scanning folder: ${path.basename(folderPath)}`,
        startTime: new Date()
    });
    
    sendLogMessage(`📁 Found ${totalFiles} media files in ${path.basename(folderPath)}`, 'info');
    
    try {
        const items = await fs.readdir(folderPath);
        let processedCount = 0;
        
        for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
                // Recursively process subdirectories
                console.log('🔧 DEBUG: Found subdirectory:', itemPath);
                const subCount = await processFolder(itemPath, originalDropPath || folderPath);
                processedCount += subCount;
            } else if (stats.isFile()) {
                const ext = path.extname(itemPath).toLowerCase();
                console.log('🔧 DEBUG: Found file:', itemPath, 'Extension:', ext);
                
                if ([...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(ext)) {
                    try {
                        console.log('🔧 DEBUG: Processing media file:', itemPath);
                        await processMediaFile(itemPath, originalDropPath || folderPath);
                        processedCount++;
                    } catch (error) {
                        console.error('🔧 DEBUG: Error processing file:', error);
                        sendLogMessage(`❌ Error processing ${path.basename(itemPath)}: ${error.message}`, 'error');
                    }
                } else {
                    console.log('🔧 DEBUG: Skipping non-media file:', itemPath);
                }
            }
        }
        
        console.log('🔧 DEBUG: Processed', processedCount, 'files from folder:', folderPath);
        
        // Mark processing as complete for this folder
        const processingTime = (new Date() - currentProgress.startTime) / 1000;
        sendProgressUpdate({
            isProcessing: false,
            currentFile: '',
            currentOperation: `✅ Completed processing ${path.basename(folderPath)} (${processingTime.toFixed(1)}s)`
        });
        
        sendLogMessage(`✅ Processed ${processedCount} media files from ${path.basename(folderPath)} in ${processingTime.toFixed(1)} seconds`, 'success');
        return processedCount;
        
    } catch (error) {
        console.error('🔧 DEBUG: Error processing folder:', error);
        sendLogMessage(`❌ Error processing folder ${path.basename(folderPath)}: ${error.message}`, 'error');
        
        // Mark processing as complete even on error
        sendProgressUpdate({
            isProcessing: false,
            currentFile: '',
            currentOperation: '❌ Processing failed'
        });
        
        return 0;
    }
}

// Electron app event handlers
app.whenReady().then(async () => {
    await initializeApp();
    createWindow();
    startWatching();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers for renderer communication
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('show-history', () => {
    createHistoryWindow();
});

ipcMain.handle('get-manifest', async () => {
    return await loadManifest();
});

ipcMain.handle('process-dropped-files', async (event, filePaths) => {
    console.log('🔧 DEBUG: process-dropped-files called with:', filePaths);
    sendLogMessage(`📥 Processing ${filePaths.length} dropped items...`, 'info');
    
    // Count total files first for progress tracking
    let totalFiles = 0;
    for (const itemPath of filePaths) {
        try {
            const stats = await fs.stat(itemPath);
            if (stats.isDirectory()) {
                totalFiles += await countMediaFiles(itemPath);
            } else if (stats.isFile()) {
                const ext = path.extname(itemPath).toLowerCase();
                if ([...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(ext)) {
                    totalFiles++;
                }
            }
        } catch (error) {
            console.error('Error counting files:', error);
        }
    }
    
    // Initialize progress tracking for multiple files
    sendProgressUpdate({
        isProcessing: true,
        currentFile: '',
        processedCount: 0,
        totalCount: totalFiles,
        currentOperation: '� Starting processing',
        startTime: new Date()
    });
    
    for (const itemPath of filePaths) {
        console.log('�🔧 DEBUG: Processing item:', itemPath);
        
        try {
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
                console.log('🔧 DEBUG: Item is a directory, calling processFolder');
                await processFolder(itemPath);
            } else if (stats.isFile()) {
                const ext = path.extname(itemPath).toLowerCase();
                console.log('🔧 DEBUG: Item is a file. Extension:', ext);
                
                if ([...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(ext)) {
                    console.log('🔧 DEBUG: File type supported, calling processMediaFile');
                    await processMediaFile(itemPath);
                } else {
                    console.log('🔧 DEBUG: File type not supported:', ext);
                    sendLogMessage(`⚠️ Skipped unsupported file type: ${path.basename(itemPath)}`, 'warning');
                }
            }
        } catch (error) {
            console.error('🔧 DEBUG: Error processing item:', error);
            sendLogMessage(`❌ Error processing ${path.basename(itemPath)}: ${error.message}`, 'error');
        }
    }
    
    // Mark all processing as complete
    const processingTime = (new Date() - currentProgress.startTime) / 1000;
    sendProgressUpdate({
        isProcessing: false,
        currentFile: '',
        currentOperation: `✅ All items processed (${processingTime.toFixed(1)}s)`
    });
    
    console.log('🔧 DEBUG: Finished processing all dropped items');
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    });
    return result;
});

ipcMain.handle('clear-history', async () => {
    try {
        await fs.writeFile(MANIFEST_FILE, '[]');
        sendLogMessage('🗑️ History cleared', 'info');
        return true;
    } catch (error) {
        sendLogMessage(`❌ Failed to clear history: ${error.message}`, 'error');
        return false;
    }
});

ipcMain.handle('open-history', () => {
    createHistoryWindow();
});

// Initialize the app on startup
initializeApp().catch(error => {
    console.error('❌ Failed to initialize app:', error);
});