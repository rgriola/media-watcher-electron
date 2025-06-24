// Test script to create sample files for testing progress tracking

const fs = require('fs-extra');
const path = require('path');

const testDir = path.join(__dirname, 'test-files');

async function createTestFiles() {
    // Create test directory
    await fs.ensureDir(testDir);
    
    // Create some sample files (small ones for testing)
    const files = [
        'sample1.mp4',
        'sample2.jpg',
        'sample3.png',
        'sample4.mov',
        'sample5.wav'
    ];
    
    console.log('Creating test files...');
    
    for (const file of files) {
        const filePath = path.join(testDir, file);
        // Create small dummy files
        await fs.writeFile(filePath, `Test content for ${file}`);
        console.log(`Created: ${file}`);
    }
    
    // Create a subfolder with more files
    const subDir = path.join(testDir, 'subfolder');
    await fs.ensureDir(subDir);
    
    const subFiles = [
        'sub1.mp4',
        'sub2.jpg',
        'sub3.png'
    ];
    
    for (const file of subFiles) {
        const filePath = path.join(subDir, file);
        await fs.writeFile(filePath, `Test content for ${file}`);
        console.log(`Created: subfolder/${file}`);
    }
    
    console.log(`\nTest files created in: ${testDir}`);
    console.log('You can now drag this folder to the Media Watcher app to test progress tracking!');
}

createTestFiles().catch(console.error);
