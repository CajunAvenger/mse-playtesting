@ECHO OFF
CALL pkg src/git_formatter.js -o "Splitter for GitHub.exe" -t node18-win-x64
CALL pkg src/ibb_formatter.js -o "Formatter for IBB.exe" -t node18-win-x64