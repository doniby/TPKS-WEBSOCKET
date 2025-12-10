# WebSocket Monitoring Client - IT Dashboard

## Overview

Professional monitoring dashboard for IT staff to monitor WebSocket server health, broadcasts, and errors **without terminal access**.

## Features ✨

### 1. **Live Broadcast Monitor** 🔴

- Real-time broadcast viewer
- Select any event to monitor
- See broadcasts as they happen
- Error visualization (no need to check logs!)
- Pause/resume monitoring
- Auto-scroll option

### 2. **Connection Status Indicator** 🟢

- Live WebSocket connection status
- Shows number of connected clients
- Visual feedback (connected/disconnected/error)

### 3. **Event Management** ⚙️

- Create, edit, delete events
- Test SQL queries before deployment
- Toggle events on/off
- See execution times and suggestions

### 4. **Real-Time Monitoring** 📈

- Server health metrics
- Event execution statistics
- Database pool usage
- Memory monitoring

### 5. **Modern UX** 💎

- Toast notifications (no more alert() popups!)
- Error boundaries (no white screen crashes)
- Responsive design
- Clean, professional interface

---

## Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` (already done if you used setup script):

```bash
cp .env.example .env
```

**For Development**: No changes needed, uses `http://localhost:3000`

**For Production**: Edit `.env` and update the URLs:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

### 3. Run Development Server

```bash
npm run dev
```

Dashboard will be available at: `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

Built files will be in `dist/` folder (served by the main server at `/admin`)

---

## Usage Guide for IT Staff

### Login

- Open the dashboard URL
- Login with admin credentials (from server `.env`)

### Monitor Broadcasts (Most Important!)

1. Click **"🔴 Live Broadcasts"** in sidebar
2. Select an event from dropdown
3. Watch broadcasts in real-time
4. **Errors show in RED** - no need to check terminal!

### Check Server Health

1. Click **"📊 Dashboard"** for overview
2. See WebSocket connections, active events, database usage
3. **Connection status always visible** in sidebar

### Manage Events

1. Click **"⚙️ Events"**
2. Create/edit/delete events
3. Test queries before activating
4. Toggle events on/off as needed

### Advanced Monitoring

1. Click **"📈 Monitoring"**
2. See detailed event statistics
3. Check success/error rates
4. Monitor execution times

---

## Environment Variables

| Variable       | Description          | Default                 |
| -------------- | -------------------- | ----------------------- |
| `VITE_API_URL` | Backend API URL      | `http://localhost:3000` |
| `VITE_WS_URL`  | WebSocket server URL | `http://localhost:3000` |

**Note**: For production, use `https://` for API and `wss://` for WebSocket!

---

## Troubleshooting

### "Disconnected" Status

- Check if WebSocket server is running
- Verify `VITE_WS_URL` in `.env` is correct
- Check browser console for connection errors

### No Broadcasts Showing

- Ensure event is **Active** (green badge)
- Check if event interval has elapsed
- Look for error messages in broadcast viewer

### Toast Notifications Not Showing

- Check if you have toast notifications enabled in your system
- Clear browser cache and reload

### Login Fails

- Verify admin credentials in server `.env`
- Check if server is accessible at `VITE_API_URL`

---

## Development Tips

### Hot Reload

Changes to `.jsx` files automatically reload the page

### Debugging

- Open browser DevTools (F12)
- Check Console tab for errors
- Network tab shows API/WebSocket traffic

### Adding Features

Main files to modify:

- `src/pages/` - Add new pages
- `src/components/` - Reusable components
- `src/services/api.js` - API calls
- `src/services/websocket.js` - WebSocket logic

---

## Production Deployment

### Option 1: Separate Hosting (Recommended)

Deploy client to Vercel/Netlify:

1. Update `.env` with production URLs
2. Run `npm run build`
3. Upload `dist/` folder

### Option 2: Server-Hosted

Built files served by Node.js server:

1. Update `.env` with production URLs
2. Run `npm run build`
3. Server serves from `/admin` route

---

## Architecture

```
client/
├── src/
│   ├── pages/              # Main pages
│   │   ├── Dashboard.jsx       # Overview dashboard
│   │   ├── BroadcastViewer.jsx # Live broadcast monitor
│   │   ├── Events.jsx          # Event management
│   │   ├── Monitoring.jsx      # Advanced monitoring
│   │   └── Login.jsx           # Authentication
│   ├── components/         # Reusable components
│   │   ├── ConnectionStatus.jsx # Connection indicator
│   │   ├── ErrorBoundary.jsx    # Error handling
│   │   ├── Toast.jsx            # Notifications
│   │   └── Layout.jsx           # App layout
│   ├── services/          # API & WebSocket
│   │   ├── api.js              # REST API client
│   │   └── websocket.js        # WebSocket client
│   ├── config/            # Configuration
│   │   └── index.js            # App config
│   └── context/           # React Context
│       └── AuthContext.jsx     # Authentication
├── .env                   # Environment config
└── package.json           # Dependencies
```

---

## Key Features for IT Operations

### ✅ No Terminal Access Needed

- All monitoring in web interface
- Visual error indicators
- Toast notifications for events

### ✅ Real-Time Monitoring

- Live broadcast viewer
- Connection status
- Event execution stats

### ✅ Professional UX

- Clean, modern interface
- Smooth notifications
- Error boundaries prevent crashes

### ✅ Production Ready

- Environment-based configuration
- Error handling
- Responsive design

---

## Support

For issues or questions:

1. Check server logs (if you have access)
2. Contact the development team
3. Review the troubleshooting section above

---

## Version

**v2.0.0** - IT Monitoring Dashboard

### What's New

- 🔴 Live Broadcast Viewer
- 🟢 Connection Status Indicator
- 💬 Toast Notifications
- 🛡️ Error Boundaries
- ⚙️ Environment Configuration
- 🎨 Enhanced UI/UX

Built for **TPKS IT Operations Team** 🚀
