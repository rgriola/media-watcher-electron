#!/bin/bash
# Media Watcher Launcher
# Double-click this file and choose "Run in Terminal"

echo "🎬 Media Watcher Launcher"
echo "=========================="

# Get the directory where this script is located
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        read -p "Press any key to exit..."
        exit 1
    fi
fi

echo "🚀 Starting Media Watcher..."
echo "📁 Watching: $(pwd)/watched-folder"
echo "📂 Sorting to: $(pwd)/sorted-media"
echo ""
echo "✅ App should open in a new window shortly..."
echo "💡 To stop the app, close the Electron window or press Ctrl+C here"
echo ""

# Start the Electron app
npm start

echo ""
echo "👋 Media Watcher has been stopped"
read -p "Press any key to close this terminal..."
