# VOIKE Windows Installation Guide

## Quick Install

```cmd
pip install voike
```

## Option 1: Use `python -m voike` (Works Immediately)

```cmd
python -m voike --version
python -m voike agent ask "test"
```

## Option 2: Add to PATH (Use `voike` directly)

### Automatic (Recommended)

1. Download: https://github.com/voike/voike/raw/main/install_windows.bat
2. Right-click → "Run as Administrator"
3. Type `Y` when prompted
4. Restart terminal
5. Use: `voike --version`

### Manual

1. Find Python Scripts folder:
```cmd
python -c "import site; print(site.USER_BASE + '\\Scripts')"
```

2. Add to PATH:
   - Press `Win + R`
   - Type: `sysdm.cpl`
   - Click "Environment Variables"
   - Under "User variables", select "Path"
   - Click "Edit" → "New"
   - Paste the Scripts path
   - Click "OK" on all dialogs

3. Restart terminal

4. Test:
```cmd
voike --version
```

## Troubleshooting

**"voike is not recognized"**
- Use `python -m voike` instead
- Or run `install_windows.bat`

**"No module named voike"**
- Reinstall: `pip install --upgrade voike`

**Still not working?**
- Check Python version: `python --version` (need 3.8+)
- Check pip: `pip show voike`

## Quick Start

```cmd
# Create project
voike init my-ai-app

# Ask AI
voike agent ask "What is VOIKE?"

# Deploy
voike deploy production
```

**Everything flows!** 🌊
