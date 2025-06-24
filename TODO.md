# Media Sorter TODO

# Media Sorter TODO

## ✅ COMPLETED: Real-time Progress Tracking (NEW!)
- [x] **COMPLETED**: Added real-time process readout to main GUI
- [x] **COMPLETED**: Implemented IPC communication for progress updates  
- [x] **COMPLETED**: Added progress bar with percentage and file count
- [x] **COMPLETED**: Show current file being processed in status bar
- [x] **COMPLETED**: Added elapsed time display during processing
- [x] **COMPLETED**: Progress tracking for both individual files and folders
- [x] **COMPLETED**: Recursive folder scanning with progress counting
- [x] **COMPLETED**: Visual feedback for all processing stages (scanning, metadata, copying)
- [x] **COMPLETED**: Created test files for verifying progress tracking functionality

## 🚨 URGENT: File Processing Not Working  
- [x] **FIXED**: Syntax error in main.js (incomplete function)
- [x] **FIXED**: File watcher calling processMediaFile with wrong parameters
- [x] **FIXED**: Added debug logging to processMediaFile function
- [x] **FIXED**: Added initializeApp() function to create directories and manifest on startup
- [x] **FIXED**: Added scanAndUpdateManifest() to check existing files vs manifest
- [x] **FIXED**: Enhanced error handling and debug logging throughout
- [x] **FIXED**: Added folder processing - app can now handle dropped folders
- [x] **FIXED**: Added recursive folder scanning to find all media files
- [x] **FIXED**: Added originalDropPath tracking to manifest entries
- [x] **FIXED**: File processing now working - 18 files processed successfully!
- [x] **FIXED**: History.js updated to work with actual manifest array format
- [x] **COMPLETED**: Verify history window displays processed files correctly
- [x] **COMPLETED**: Verify tabs in history window work properly

## ✅ COMPLETED: Timezone & Date Handling
- [x] Fixed UTC to local time conversion for proper date grouping
- [x] Documented timezone handling approach (UTC storage, local display)
- [x] Added comments clarifying timezone conversion in all date functions
- [x] Prepared foundation for professional camera XML metadata processing
- [x] Added Developer Tools access (F12 or Cmd+Shift+I)

## 🎯 Priority 1: Complete Original Location Tracking

### 1. Update History Display
- [x] Modify history.js to show original path in file details
- [x] Add original path display to both active and removed files
- [x] Handle cases where originalPath is missing or "Unknown"
- [x] Add Clear import date to history with "Day" at the top of the column Summary ie; if local time is 6-23-2025 then import says TODAY June 23 - 2025, each history line summary shows local import time ie; 6:23 PM 
- [x] Fixed timezone handling: manifest stores UTC, UI shows local time

### 2. Fix Folder Processing
- [x] Update processFolder() function to track original paths for nested files
- [x] Ensure recursive folder scanning preserves source location
- [x] Update drag & drop handling to pass original folder paths

### 3. Improve Existing File Handling
- [x] Update scanExistingFiles() to better handle missing original paths
- [ ] Add option to manually set original path for existing files
- [ ] Consider adding "Import Location" field for user input

## 🔧 Priority 2: Bug Fixes & Improvements

## 🔧 Priority 2: Next Enhancements

### 4. Code Cleanup
- [ ] Remove console.log statements left from debugging (optional - keep for troubleshooting)
- [x] Verify all IPC handlers are working correctly
- [x] Add progress tracking IPC handlers

### 5. UI/UX Improvements  
- [x] Real-time progress display with visual progress bar
- [x] Current file name display during processing
- [x] Processing time tracking and display
- [ ] Add ability to cancel/pause processing (future enhancement)
- [ ] Add detailed processing statistics (files/second, etc.)

### 6. Testing & Validation
- [x] Created test file generation script (test-progress.js)
- [ ] Test with large folders (100+ files)
- [ ] Test with nested folder structures
- [ ] Test with mixed file types
- [ ] Verify performance with large video files

### 5. Error Handling
- [ ] Add better error handling for file operations
- [ ] Improve manifest corruption recovery
- [ ] Add validation for originalPath values

### 6. UI/UX Enhancements
- [ ] Add tooltips to show full original paths
- [ ] Consider adding filter/search functionality to history
- [ ] Add export functionality for manifest data

## 🧪 Priority 3: Testing & Validation

### 7. Feature Testing
- [ ] Test drag & drop with original path tracking
- [ ] Test folder processing with nested structures
- [ ] Verify manifest updates correctly
- [ ] Test history window displays original paths

### 8. Edge Case Testing
- [ ] Test with very long file paths
- [ ] Test with special characters in paths
- [ ] Test with network/external drive sources
- [ ] Test manifest recovery scenarios

## 📚 Priority 4: Documentation & Future Features

### 9. Documentation
- [ ] Update README with original location tracking feature
- [ ] Document manifest file structure
- [ ] Add usage examples for professional workflows

### 10. Future Enhancements (Optional)
- [ ] Add duplicate detection based on original source
- [ ] Add option to re-link files to original locations
- [ ] Consider adding batch import from multiple sources
- [ ] Add statistics about source locations

## 🚀 Future Enhancements: Professional Camera Support

### 9. Camera Metadata Processing
- [ ] Parse professional camera XML metadata files
- [ ] Handle timezone-aware timestamps from camera metadata
- [ ] Support camera-specific date/time formats
- [ ] Preserve original camera settings and metadata
- [ ] Add support for sidecar files (.xml, .xmp)

### 10. Multi-Timezone Support
- [ ] Allow manual timezone specification for imported media
- [ ] Handle mixed-timezone imports (e.g., travel photography)
- [ ] Display timezone information in history
- [ ] Support timezone conversion for different workflows