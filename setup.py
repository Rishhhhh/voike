from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="voike",
    version="3.0.1",
    author="VOIKE Team",
    author_email="team@voike.ai",
    description="VOIKE - The FLOW-Native AI Platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/voike/voike",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Build Tools",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
        "pyyaml>=6.0",
        "click>=8.1.0",
        "python-dotenv>=1.0.0",
    ],
    entry_points={
        "console_scripts": [
            "voike=voike.cli:main",
        ],
    },
    include_package_data=True,
    package_data={
        "voike": ["flows/**/*.flow"],
    },
)
