@echo off
rem Run this harness only, without global ~/.claude (gstack, superpowers, global CLAUDE.md)
setlocal
set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude-clean"
cd /d "%~dp0"
echo CLAUDE_CONFIG_DIR=%CLAUDE_CONFIG_DIR%
claude %*
