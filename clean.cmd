@echo off
rem 전역 ~/.claude(gstack, superpowers, 전역 CLAUDE.md) 없이 이 하네스만으로 실행
setlocal
set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude-clean"
cd /d "%~dp0"
echo CLAUDE_CONFIG_DIR=%CLAUDE_CONFIG_DIR%
claude %*
