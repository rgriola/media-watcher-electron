tell application "Terminal"
    activate
    do script "cd '/Users/rgriola/Desktop/WatchFolder' && if [ ! -d 'node_modules' ]; then echo 'Installing dependencies...' && npm install; fi && echo 'Starting Media Watcher...' && npm start"
end tell
