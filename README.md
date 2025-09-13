
```
media-stream-player
├─ .claude
│  └─ settings.local.json
├─ README.md
├─ setup-structure.ps1
├─ stream-server
│  ├─ .env
│  ├─ nginx
│  │  └─ nginx.conf
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ pm2
│  │  └─ ecosystem.config.js
│  ├─ README.md
│  ├─ scripts
│  │  ├─ dev-clean.ps1
│  │  ├─ ffmpeg-check.ps1
│  │  └─ seed-demo.ps1
│  ├─ src
│  │  ├─ app.js
│  │  ├─ config
│  │  │  ├─ constants.js
│  │  │  ├─ env.js
│  │  │  └─ logger.js
│  │  ├─ controllers
│  │  │  ├─ hls.controller.js
│  │  │  ├─ hls_abr.controller.js
│  │  │  ├─ proxy.controller.ts
│  │  │  ├─ remux.controller.js
│  │  │  └─ stream.controller.js
│  │  ├─ jobs
│  │  │  ├─ cleanup.job.js
│  │  │  └─ prefetch.job.ts
│  │  ├─ middlewares
│  │  │  ├─ auth.middleware.ts
│  │  │  ├─ cors.middleware.ts
│  │  │  ├─ error.middleware.ts
│  │  │  ├─ hlsAccess.middleware.js
│  │  │  └─ ratelimit.middleware.ts
│  │  ├─ routes
│  │  │  ├─ health.routes.js
│  │  │  ├─ index.js
│  │  │  ├─ proxy.routes.js
│  │  │  └─ stream.routes.js
│  │  ├─ server.js
│  │  ├─ services
│  │  │  ├─ cache.service.ts
│  │  │  ├─ decision.service.js
│  │  │  ├─ packager
│  │  │  │  ├─ dashPackager.ts
│  │  │  │  └─ hlsPackager.ts
│  │  │  ├─ probe.service.js
│  │  │  ├─ proxy.service.ts
│  │  │  ├─ session.service.js
│  │  │  ├─ subtitle.service.ts
│  │  │  ├─ thumbnail.service.ts
│  │  │  └─ transcoder.service.ts
│  │  ├─ storage
│  │  │  ├─ segments
│  │  │  │  ├─ dash
│  │  │  │  └─ hls
│  │  │  │     ├─ dXwpERuZmUPc
│  │  │  │     └─ qqnxVVFcM8jk
│  │  │  │        └─ master.m3u8
│  │  │  ├─ thumbnails
│  │  │  └─ tmp
│  │  ├─ typings
│  │  ├─ utils
│  │  │  ├─ ffmpeg.ts
│  │  │  ├─ files.js
│  │  │  ├─ ids.js
│  │  │  ├─ ranges.ts
│  │  │  └─ seedr.ts
│  │  └─ workers
│  ├─ storage
│  │  └─ segments
│  │     └─ hls
│  └─ tsconfig.json
└─ stream-web
   ├─ .env
   ├─ eslint.config.js
   ├─ index.html
   ├─ package-lock.json
   ├─ package.json
   ├─ public
   │  └─ vite.svg
   ├─ README.md
   ├─ SETUP.md
   ├─ src
   │  ├─ App.css
   │  ├─ App.jsx
   │  ├─ assets
   │  │  └─ react.svg
   │  ├─ components
   │  │  ├─ HlsPlayer.jsx
   │  │  ├─ SimplePlayer.jsx
   │  │  ├─ UniversalPlayer.jsx
   │  │  └─ VideoControls.jsx
   │  ├─ hooks
   │  │  └─ useVideoStream.js
   │  ├─ index.css
   │  ├─ main.jsx
   │  └─ services
   │     └─ api.js
   └─ vite.config.js

```