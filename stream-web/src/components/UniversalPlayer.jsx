import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import VideoControls from './VideoControls';

const UniversalPlayer = ({ 
  url,
  mode = 'hls', // 'hls' or 'direct'
  onError, 
  onLoadStart, 
  onLoadComplete,
  className = "w-full h-auto rounded-lg shadow-lg"
}) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bufferHealth, setBufferHealth] = useState(0);

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const initializeDirect = useCallback(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setIsLoading(true);
    onLoadStart?.();

    // Direct streaming - just set the src
    video.src = url;
    
    video.addEventListener('loadedmetadata', () => {
      setIsLoading(false);
      onLoadComplete?.();
      console.log('Direct streaming: metadata loaded');
    });

    video.addEventListener('error', (e) => {
      setIsLoading(false);
      console.error('Direct streaming error:', e);
      onError?.('Direct streaming playback error');
    });

    video.addEventListener('canplaythrough', () => {
      console.log('Direct streaming: ready to play');
    });

  }, [url, onError, onLoadStart, onLoadComplete]);

  const initializeHls = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !url) return;

    cleanupHls();
    setIsLoading(true);
    onLoadStart?.();

    if (Hls.isSupported()) {
      const hls = new Hls({
        // Buffer settings optimized for YouTube-like experience (2-5 minutes ahead)
        maxBufferLength: 300, // 5 minutes of video buffer for smooth playback
        maxMaxBufferLength: 600, // Maximum buffer cap (10 minutes)
        maxBufferSize: 200 * 1000 * 1000, // 200MB buffer size for HD content
        maxBufferHole: 0.2, // Smaller gap tolerance for smoother playback
        
        // Aggressive prefetching for continuous long videos
        backBufferLength: 120, // Keep 2 minutes behind current time
        frontBufferFlushThreshold: 600, // Only flush when buffer exceeds 10 minutes
        
        // Fragment loading settings optimized for long videos
        fragLoadingTimeOut: 60000, // 60s timeout for large segments
        fragLoadingMaxRetry: 10, // More retries for network issues
        fragLoadingRetryDelay: 1000, // 1s between retries
        
        // Manifest loading optimized for event streams
        manifestLoadingTimeOut: 20000, // 20s timeout for manifest
        manifestLoadingMaxRetry: 5, // More retries for manifest
        manifestLoadingRetryDelay: 2000, // 2s between manifest retries
        
        // Level loading
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 5,
        levelLoadingRetryDelay: 1000,
        
        // Progressive loading for event streams
        liveSyncDurationCount: 3,        // Target sync duration count
        liveMaxLatencyDurationCount: 15, // Must be > liveSyncDurationCount
        liveDurationInfinity: true,      // Handle infinite duration streams
        
        // Optimized for event/VOD hybrid
        startLevel: -1, // Auto quality selection
        capLevelToPlayerSize: false, // Don't limit quality to player size
        
        // Error recovery optimized for long streams
        enableWorker: true,
        enableSoftwareAES: true,
        
        // Network resilience
        xhrSetup: function(xhr, url) {
          xhr.timeout = 60000; // 60s timeout for requests
        },
      });

      hlsRef.current = hls;

      // Event listeners for monitoring and error handling
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('HLS: Media attached');
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('HLS: Manifest parsed, levels:', data.levels.length);
        setIsLoading(false);
        onLoadComplete?.();
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        // Update buffer health indicator
        if (video.buffered.length > 0) {
          const currentTime = video.currentTime;
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          const bufferSeconds = Math.max(0, bufferedEnd - currentTime);
          setBufferHealth(Math.min(100, (bufferSeconds / 60) * 100));
        }
      });

      // Error handling
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        
        if (data.fatal) {
          // Save current position for recovery
          const currentPosition = video.currentTime;
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, attempting to recover from position:', currentPosition);
              hls.startLoad();
              
              // Restore position after recovery
              if (currentPosition > 0) {
                const restoreAfterRecovery = () => {
                  if (video.readyState >= 2) { // HAVE_CURRENT_DATA or better
                    video.currentTime = currentPosition;
                    console.log('Position restored after network recovery:', currentPosition);
                    hls.off(Hls.Events.FRAG_BUFFERED, restoreAfterRecovery);
                  }
                };
                hls.on(Hls.Events.FRAG_BUFFERED, restoreAfterRecovery);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, attempting to recover from position:', currentPosition);
              hls.recoverMediaError();
              
              // Restore position after media recovery
              if (currentPosition > 0) {
                setTimeout(() => {
                  if (video.readyState >= 2) {
                    video.currentTime = currentPosition;
                    console.log('Position restored after media recovery:', currentPosition);
                  }
                }, 1000);
              }
              break;
            default:
              console.log('Fatal error, cannot recover');
              setIsLoading(false);
              onError?.(`HLS Fatal Error: ${data.type} - ${data.details}`);
              break;
          }
        } else {
          console.warn('Non-fatal HLS error:', data);
        }
      });

      // Load and attach
      hls.loadSource(url);
      hls.attachMedia(video);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        onLoadComplete?.();
      });
      video.addEventListener('error', () => {
        setIsLoading(false);
        onError?.('Native HLS playback error');
      });
    } else {
      setIsLoading(false);
      onError?.('HLS is not supported in this browser');
    }
  }, [url, onError, onLoadStart, onLoadComplete, cleanupHls]);

  // Initialize player based on mode
  useEffect(() => {
    if (url) {
      if (mode === 'direct') {
        initializeDirect();
      } else {
        initializeHls();
      }
    }
    
    return cleanupHls;
  }, [url, mode, initializeDirect, initializeHls, cleanupHls]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanupHls;
  }, [cleanupHls]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className={className}
        controls
        preload="metadata"
        playsInline
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
          <div className="flex items-center space-x-3 text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span>Loading video... ({mode} mode)</span>
          </div>
        </div>
      )}
      
      {bufferHealth > 0 && mode === 'hls' && (
        <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          Buffer: {Math.round(bufferHealth)}%
        </div>
      )}
      
      {mode === 'direct' && (
        <div className="absolute top-2 left-2 bg-green-600 bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          Direct Stream (Low CPU)
        </div>
      )}
      
      {!isLoading && (
        <VideoControls 
          videoRef={videoRef} 
          className="mt-4"
        />
      )}
    </div>
  );
};

export default UniversalPlayer;