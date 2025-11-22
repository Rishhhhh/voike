# VOIKE Installation Guide

## All Platforms

```bash
pip install voike
```

## Usage

### Linux & Mac
```bash
voike --version
voike agent ask "What is VOIKE?"
```

### Windows

**Option 1: Use `python -m` (Recommended)**
```cmd
python -m voike --version
python -m voike agent ask "What is VOIKE?"
```

**Option 2: Add Scripts to PATH**
1. Find Python Scripts folder: `pip show voike`
2. Add to PATH: `C:\Users\YourName\AppData\Local\Programs\Python\Python3X\Scripts`
3. Restart terminal
4. Use: `voike --version`

**Option 3: Create Alias (PowerShell)**
```powershell
# Add to PowerShell profile
function voike { python -m voike $args }
```

## Verify Installation

```bash
# All platforms
python -m voike --version
# Output: VOIKE v3.0.0
```

## Quick Start

```bash
# Create project
python -m voike init my-ai-app

# Ask AI
python -m voike agent ask "What is VOIKE?"

# Deploy
python -m voike deploy production
```

**Everything flows!** 🌊
