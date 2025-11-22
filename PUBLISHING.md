# Publishing VOIKE to PyPI 🚀

## Prerequisites

```bash
# Install build tools
pip install build twine

# Or in your venv
python3 -m pip install build twine
```

## Build Package

```bash
# Clean previous builds
rm -rf dist/ build/ *.egg-info/

# Build source and wheel distributions
python3 -m build
```

This creates:
- `dist/voike-3.0.0.tar.gz` (source distribution)
- `dist/voike-3.0.0-py3-none-any.whl` (wheel)

## Test Locally

```bash
# Install from local build
pip install dist/voike-3.0.0-py3-none-any.whl

# Test it works
voike --version
```

## Upload to TestPyPI (Optional - Test First)

```bash
# Upload to test repository
python3 -m twine upload --repository testpypi dist/*

# Test install from TestPyPI
pip install --index-url https://test.pypi.org/simple/ voike
```

## Upload to PyPI (Production)

```bash
# Upload to PyPI
python3 -m twine upload dist/*

# You'll be prompted for:
# - Username: __token__
# - Password: your-pypi-api-token
```

## Get PyPI API Token

1. Go to https://pypi.org/manage/account/token/
2. Create new API token
3. Copy token
4. Use as password when uploading

## After Publishing

```bash
# Anyone can now install
pip install voike

# Use it
voike --version
voike init my-project
```

## Update Version

When releasing new version:
1. Update version in `setup.py` and `pyproject.toml`
2. Update `voike/__init__.py` version
3. Rebuild and republish

**VOIKE is now available to the world!** 🌊
