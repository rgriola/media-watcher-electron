# Media Watcher Electron App

This Electron application watches a folder for new media files and automatically sorts them into organized folders with **real-time progress tracking**.

## ✨ NEW: Real-Time Progress Tracking

The app now shows you exactly what it's doing as it processes your media files:
- **Visual Progress Bar**: See percentage completion and file counts
- **Current File Display**: Shows which file is being processed
- **Processing Stages**: Track scanning, metadata extraction, and file copying
- **Elapsed Time**: See how long processing has been running
- **Folder Support**: Drag entire folders for batch processing with progress

## 🚀 Key Features

- **Drag & Drop Interface**: Simply drop files or folders onto the app
- **Automatic Organization**: Files are sorted by date and media type
- **Metadata Extraction**: Preserves EXIF data, video timecodes, and camera info
- **Professional Workflow Support**: Handles MXF, ARW, and other pro formats
- **Processing History**: View all processed files with detailed information
- **Real-Time Feedback**: See exactly what the app is doing at all times

## How to Run the App

### Method 1: Using the Command File (Most Reliable)
Double-click on `launch.command` and choose "Run in Terminal" when prompted.
- ✅ Works consistently
- ✅ Shows helpful status messages
- ✅ Easy to use

### Method 2: Using the Simple Launcher
Double-click on `MediaWatcher` (no extension) - this opens Terminal automatically.
- ✅ Opens Terminal automatically
- ✅ Simple double-click operation

### Method 3: Using Terminal Directly
```bash
npm install  # Only needed first time
npm start
```

### Method 4: Using Electron directly
```bash
npx electron .
```

## Note about MediaWatcher.app
The `.app` bundle may have issues due to macOS security restrictions. Use the methods above instead.

## Important Notes

- **DO NOT** double-click on `index.html` - this will open it in your browser instead of the Electron app
- The app must be launched using one of the methods above to work properly
- When running properly, you'll see an Electron window (not a browser tab)

## How It Works

### File Processing
1. **Drag & Drop**: Drop individual files or entire folders onto the app window
2. **Automatic Scanning**: The app recursively scans folders to find all media files
3. **Progress Tracking**: Real-time progress bar shows current file and completion percentage
4. **Metadata Extraction**: Reads EXIF data, video timecodes, and camera information
5. **Smart Organization**: Files are automatically sorted into date-based folders:
   - Videos → `sorted-media/videos/YYYY-MM-DD/`
   - Audio → `sorted-media/audio/YYYY-MM-DD/`
   - Images → `sorted-media/images/YYYY-MM-DD/`
6. **History Tracking**: All processed files are logged with full metadata

### Watch Folder (Legacy Mode)
- The app also watches the `watched-folder` directory for new files
- Files added to this folder are automatically processed

## 📊 Progress Tracking Features

When processing files, you'll see:
- **📁 Scanning folder**: Counting total files for accurate progress
- **📄 Processing file**: Individual file handling  
- **🔍 Reading metadata**: Extracting EXIF/video data
- **📁 Copying file**: Moving to organized location
- **✅ File completed**: Individual file finished
- **⏱️ Processing time**: Real-time elapsed time display

## 📋 History Window

Click the "History" button to view:
- All processed files organized by date
- Original file locations and drop paths
- Detailed metadata for each file
- Professional camera information (timecodes, etc.)
- Files that have been removed or moved

## 🎬 Professional Features

### Video Support
- Timecode extraction from MXF, MOV, MP4 files
- Professional camera metadata (reel, scene, take)
- Duration and frame rate information
- Start/end timecode calculation

### Image Support  
- EXIF data preservation
- Camera settings (ISO, aperture, etc.)
- GPS coordinates if available
- RAW file support (.ARW, etc.)

### Audio Support
- Metadata extraction from common formats
- Bitrate and sample rate information

## Supported File Types

- **Videos**: .mp4, .mov, .avi, .mkv, .mxf
- **Audio**: .mp3, .wav, .aac, .flac
- **Images**: .jpg, .jpeg, .png, .gif, .bmp, .webp, .tiff, .ARW

## Troubleshooting

If the app opens in Chrome instead of as an Electron app:
- Make sure you're using the launcher script or npm start
- Do not double-click the HTML file directly
