# 🚀 VOIKE Quick Start Guide

## The Issue
Server failed because PostgreSQL isn't running:
```
Error: getaddrinfo ENOTFOUND postgres
```

## Solution: Start PostgreSQL First

### Option 1: Use Start Script (Easiest)
```bash
./start.sh
```

### Option 2: Manual Steps
```bash
# 1. Start PostgreSQL
docker-compose up -d postgres

# 2. Wait 3 seconds
sleep 3

# 3. Start VOIKE
npm run dev
```

### Option 3: Start All Services
```bash
# Start everything (PostgreSQL + Redis + etc)
docker-compose up -d

# Then start VOIKE
npm run dev
```

## Verify It's Working

### Check PostgreSQL
```bash
docker-compose ps
# Should show: postgres ... Up
```

### Check VOIKE Logs
```bash
# Look for these logs:
[FLOW-Native] Executor initialized - routing 150+ operations to FLOW files
Server listening on port 3000
```

### Test FLOW Execution
```bash
# In another terminal:
python3 test_flow.py
```

## Troubleshooting

### PostgreSQL Not Starting
```bash
# Check Docker
docker info

# Restart PostgreSQL
docker-compose restart postgres

# View logs
docker-compose logs postgres
```

### Port Already in Use
```bash
# Find what's using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

## Quick Commands

```bash
# Start everything
./start.sh

# Stop everything
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f
```

**Now try: `./start.sh`** 🚀
