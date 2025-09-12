# Media Stream Player - React Frontend

A modern React frontend for streaming videos using HLS.js with optimized buffering and seeking capabilities.

## Features

- **HLS Video Streaming**: Stream videos from remote URLs using HLS.js
- **Optimized Buffering**: 60-second buffer for network interruption resilience  
- **Advanced Seeking**: Quick 10s/10min forward/backward controls
- **Error Handling**: User-friendly error messages and recovery
- **Responsive UI**: Clean Tailwind CSS design
- **Modular Architecture**: Reusable components and hooks

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your backend URL
VITE_API_URL=http://localhost:3000
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Backend Requirements

Your Node.js backend should have:

- `POST /stream/hls/start` endpoint accepting `{ url: "..." }`
- Response format: `{ ok: true, sessionId: "...", hlsUrl: "/stream/hls/.../master.m3u8" }`
- HLS file serving at the returned `hlsUrl`

## Usage

1. **Enter Video URL**: Paste any remote video URL (Seedr, direct links)
2. **Click "Start Streaming"**: Backend converts to HLS format
3. **Video Plays**: Automatic buffering with network resilience
4. **Use Controls**: Native video controls + enhanced seeking buttons

## Project Structure

```
src/
├── components/
│   ├── HlsPlayer.jsx      # Main video player with hls.js
│   └── VideoControls.jsx  # Enhanced seeking controls
├── hooks/
│   └── useVideoStream.js  # Stream management hook
├── services/
│   └── api.js            # Backend API integration
└── App.jsx               # Main application component
```

## Deployment

### Development
- Frontend: `http://localhost:5174` (or available port)
- Backend: Configure `VITE_API_URL` to your backend URL

### Production (VPS)
1. Build frontend: `npm run build`
2. Serve `dist/` folder with Nginx/Apache
3. Update `.env` with production backend URL:
   ```
   VITE_API_URL=https://your-vps-domain.com
   ```

## HLS Configuration

The player is optimized for:
- **60-second buffer** for network interruptions
- **Single-variant VOD** streams (your backend setup)
- **AAC audio** compatibility
- **Fragment retry** logic for unstable connections

## Troubleshooting

1. **"HLS is not supported"**: Update browser or check hls.js compatibility
2. **Network errors**: Verify backend URL in `.env` file
3. **Video won't load**: Check backend logs and ensure HLS segments are accessible
4. **CORS issues**: Configure backend CORS for frontend domain