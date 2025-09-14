import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';

const SimplePlayer = ({ 
  videoUrl,
  onError,
  className = "w-full h-auto rounded-lg shadow-lg"
}) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNetworkDown, setIsNetworkDown] = useState(false);
  const [savedPosition, setSavedPosition] = useState(0);
  const [wasPlayingBeforeStall, setWasPlayingBeforeStall] = useState(false);
  const [bufferHealth, setBufferHealth] = useState(0);
  const [isAutoResuming, setIsAutoResuming] = useState(false);

  // Cleanup HLS instance
  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Network monitoring for auto-resume
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network reconnected');
      setIsNetworkDown(false);
      
      const video = videoRef.current;
      if (video && wasPlayingBeforeStall && savedPosition > 0) {
        console.log('Auto-resuming HLS playback from position:', savedPosition);
        setIsAutoResuming(true);
        
        // Wait a bit for HLS to recover, then restore position
        setTimeout(() => {
          if (video.readyState >= 2) {
            video.currentTime = savedPosition;
            video.play().catch(e => console.log('Auto-play failed:', e));
            setWasPlayingBeforeStall(false);
            setSavedPosition(0);
            setIsAutoResuming(false);
          }
        }, 1000);
      }
    };

    const handleOffline = () => {
      console.log('Network disconnected');
      setIsNetworkDown(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [savedPosition, wasPlayingBeforeStall]);

  // Convert simple stream session to HLS
  const convertToHls = useCallback(async (sessionId) => {
    try {
      console.log('🎯 Getting session info for:', sessionId);
      
      // Get the original URL from the simple session status  
      const simpleStatusResponse = await fetch(`/stream/simple/status/${sessionId}`);
      
      if (!simpleStatusResponse.ok) {
        console.log('⚠️ Could not get session info, trying alternative approach...');
        throw new Error('Unable to get original URL from session. Please restart with HLS mode.');
      }
      
      const sessionInfo = await simpleStatusResponse.json();
      console.log('📋 Retrieved session info:', sessionInfo);
      
      if (!sessionInfo.originalUrl && !sessionInfo.url) {
        throw new Error('No original URL found in session');
      }
      
      const originalUrl = sessionInfo.originalUrl || sessionInfo.url;
      console.log('🔗 Using original URL for HLS conversion:', originalUrl);

      console.log('🚀 Starting HLS conversion...');
      const response = await fetch('/stream/hls/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: originalUrl
        })
      });

      if (!response.ok) {
        throw new Error(`HLS conversion failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ HLS conversion started:', data);

      if (data.ok && data.hlsUrl) {
        console.log('🎬 HLS URL ready:', data.hlsUrl);
        
        // Now initialize with the HLS URL
        const video = videoRef.current;
        if (video && Hls.isSupported()) {
          initializeWithHlsUrl(data.hlsUrl);
        } else {
          setIsLoading(false);
          onError?.('HLS not supported in this browser');
        }
      } else {
        throw new Error('Invalid HLS response');
      }
    } catch (error) {
      console.error('❌ HLS conversion failed:', error);
      setIsLoading(false);
      onError?.(`HLS conversion failed: ${error.message}`);
    }
  }, []);

  // Initialize with a specific HLS URL
  const initializeWithHlsUrl = useCallback((hlsUrl) => {
    const video = videoRef.current;
    if (!video) return;

    console.log('🎯 Initializing HLS with URL:', hlsUrl);

    if (Hls.isSupported()) {
      // Move the HLS configuration and setup here
      createHlsInstance(hlsUrl);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      console.log('Using native HLS support');
      video.src = hlsUrl;
      
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        console.log('Native HLS: metadata loaded');
      });
      
      video.addEventListener('error', () => {
        setIsLoading(false);
        onError?.('Native HLS playbook error');
      });
    } else {
      setIsLoading(false);
      onError?.('HLS is not supported in this browser');
    }
  }, []);

  // Create and configure HLS instance
  const createHlsInstance = useCallback((hlsUrl) => {
    const video = videoRef.current;
    if (!video) return;

    cleanupHls();

    // HLS.js configuration optimized for smooth sequential playback
    const hls = new Hls({
      // ===== SEQUENTIAL PLAYBACK SETTINGS =====
      maxBufferLength: 30, // Smaller buffer to prevent jumping ahead
      maxMaxBufferLength: 60, // Max 1 minute buffer
      maxBufferSize: 50 * 1000 * 1000, // 50MB buffer size
      maxBufferHole: 0.1, // Very small gap tolerance
      
      // ===== SMOOTH STREAMING SETTINGS =====
      // Reduce aggressive buffering to prevent segment jumping
      lowLatencyMode: false, // Disable low latency for smoother playback
      backBufferLength: 30, // Keep 30s behind current position
      frontBufferFlushThreshold: 60, // Only flush when buffer exceeds 1 minute
      
      // ===== FRAGMENT LOADING =====
      fragLoadingTimeOut: 20000, // 20s timeout
      fragLoadingMaxRetry: 6, // Fewer retries for faster failure detection
      fragLoadingRetryDelay: 500, // Faster retry
      fragLoadingMaxRetryTimeout: 5000, // Max 5s between retries
      
      // ===== MANIFEST SETTINGS =====
      manifestLoadingTimeOut: 10000, // 10s timeout for manifest
      manifestLoadingMaxRetry: 4, // Fewer manifest retries
      manifestLoadingRetryDelay: 1000, // 1s between retries
      manifestLoadingMaxRetryTimeout: 4000, // Max 4s between retries
      
      // ===== LEVEL LOADING =====
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 3,
      levelLoadingRetryDelay: 500,
      levelLoadingMaxRetryTimeout: 2000,
      
      // ===== PLAYBACK CONTROL =====
      // Prevent aggressive seeking behavior
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 5,
      liveDurationInfinity: false, // Disable for VOD content
      
      // ===== STREAMING MODE =====
      startLevel: -1, // Auto quality selection
      capLevelToPlayerSize: false, // Don't limit quality
      
      // ===== SEQUENTIAL PLAYBACK OPTIMIZATION =====
      // Force sequential segment loading
      enableWorker: true,
      enableSoftwareAES: true,
      
      // ===== REQUEST SETTINGS =====
      xhrSetup: function(xhr, url) {
        xhr.timeout = 20000; // 20s timeout for requests
      },
      
      // ===== PREVENT JUMPING BEHAVIOR =====
      // Additional settings to ensure smooth sequential playback
      abrEwmaFastLive: 3.0,
      abrEwmaSlowLive: 9.0,
      abrEwmaFastVoD: 3.0,
      abrEwmaSlowVoD: 9.0,
      abrEwmaDefaultEstimate: 500000, // 500kbps default estimate
      abrBandWidthFactor: 0.95, // Conservative bandwidth estimation
      abrBandWidthUpFactor: 0.7, // Slow quality upgrades
    });

    hlsRef.current = hls;

    // ===== HLS EVENT HANDLERS =====
    
    // Media attached
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('HLS: Media attached, ready for playback');
    });

    // Manifest parsed - ready for instant start
    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('HLS: Manifest parsed, levels available:', data.levels.length);
      setIsLoading(false);
      
      // Force playback to start from beginning
      video.currentTime = 0;
      
      // Start playback immediately with first segments
      if (data.levels.length > 0) {
        console.log('HLS: Ready for sequential playback from start');
      }
    });

    // Monitor fragment loading to prevent jumping
    hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
      console.log('HLS: Loading fragment', data.frag.sn, 'for level', data.frag.level);
    });

    // Prevent buffer jumping by monitoring seeks
    hls.on(Hls.Events.BUFFER_CREATED, (event, data) => {
      console.log('HLS: Buffer created, ensuring sequential playback');
    });

    // Fragment buffered - update buffer health
    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (video.buffered.length > 0) {
        const currentTime = video.currentTime;
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufferSeconds = Math.max(0, bufferedEnd - currentTime);
        setBufferHealth(Math.min(100, (bufferSeconds / 60) * 100));
      }
    });

    // ===== NETWORK RESILIENCE ERROR HANDLING =====
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS Error:', data);
      
      if (data.fatal) {
        // Save position before any recovery attempts
        const currentPosition = video.currentTime;
        const wasPlaying = !video.paused;
        
        if (currentPosition > 0) {
          setSavedPosition(currentPosition);
          setWasPlayingBeforeStall(wasPlaying);
          console.log('HLS: Saved position during error:', currentPosition, 'wasPlaying:', wasPlaying);
        }
        
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('HLS: Network error, attempting recovery from position:', currentPosition);
            setIsNetworkDown(true);
            
            // Try to recover without losing position
            try {
              hls.startLoad();
              
              // Restore position after recovery
              if (currentPosition > 0) {
                const restoreAfterRecovery = () => {
                  if (video.readyState >= 2) {
                    video.currentTime = currentPosition;
                    if (wasPlaying) {
                      video.play().catch(e => console.log('Resume play failed:', e));
                    }
                    console.log('HLS: Position restored after network recovery:', currentPosition);
                    hls.off(Hls.Events.FRAG_BUFFERED, restoreAfterRecovery);
                  }
                };
                hls.on(Hls.Events.FRAG_BUFFERED, restoreAfterRecovery);
              }
            } catch (e) {
              console.error('HLS: Network recovery failed:', e);
            }
            break;
            
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('HLS: Media error, attempting recovery from position:', currentPosition);
            
            try {
              hls.recoverMediaError();
              
              // Restore position after media recovery
              if (currentPosition > 0) {
                setTimeout(() => {
                  if (video.readyState >= 2) {
                    video.currentTime = currentPosition;
                    if (wasPlaying) {
                      video.play().catch(e => console.log('Resume play failed:', e));
                    }
                    console.log('HLS: Position restored after media recovery:', currentPosition);
                  }
                }, 1000);
              }
            } catch (e) {
              console.error('HLS: Media recovery failed:', e);
            }
            break;
            
          default:
            console.log('HLS: Fatal error, cannot recover:', data.type);
            setIsLoading(false);
            onError?.(`HLS Fatal Error: ${data.type} - ${data.details}`);
            break;
        }
      } else {
        // Non-fatal errors - just log
        console.warn('HLS: Non-fatal error:', data);
      }
    });

    // Network recovery detected
    hls.on(Hls.Events.FRAG_LOADED, () => {
      if (isNetworkDown) {
        console.log('HLS: Network recovery detected via fragment load');
        setIsNetworkDown(false);
      }
    });

    // Load source and attach to video
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
  }, [isNetworkDown, cleanupHls, onError]);

  // Initialize HLS player
  const initializeHls = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    cleanupHls();
    setIsLoading(true);

    // Debug: Log the URL we're trying to play
    console.log('🎬 SimplePlayer: Initializing with URL:', videoUrl);

    // Auto-detect streaming type
    const isHlsUrl = videoUrl.includes('.m3u8');
    const isRemuxStream = videoUrl.includes('/stream/remux.mp4');
    const isSimpleStream = videoUrl.includes('/stream/simple/');
    
    console.log('🔍 URL Analysis:', {
      url: videoUrl,
      isHlsUrl,
      isRemuxStream,
      isSimpleStream,
      urlLength: videoUrl.length
    });

    // If it's HLS, use HLS.js
    if (isHlsUrl) {
      console.log('🎯 HLS stream detected - using HLS.js');
      createHlsInstance(videoUrl);
      return;
    }

    // For all other streams (remux, simple), use progressive loading
    console.log('📺 Progressive stream detected - using native video player');
    
    // Progressive loading with optimized settings
    video.src = videoUrl;
    video.preload = 'auto'; // Preload for smoother playback
    video.currentTime = 0;  // Always start from beginning
    
    // Add event listeners for progressive loading
    const handleLoadedMetadata = () => {
      console.log('Progressive: Metadata loaded, duration:', video.duration);
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      console.log('Progressive: Can start playing');
      setIsLoading(false);
    };

    const handleLoadStart = () => {
      console.log('Progressive: Loading started');
      setIsLoading(true);
    };

    const handleProgress = () => {
      // Log buffering progress
      if (video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        const duration = video.duration;
        if (duration > 0) {
          const bufferPercent = (buffered / duration) * 100;
          setBufferHealth(Math.min(100, bufferPercent));
        }
      }
    };

    const handleError = (e) => {
      console.error('Progressive: Playback error:', e);
      setIsLoading(false);
      onError?.('Progressive video playback error');
    };

    // Add event listeners
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('error', handleError);

    // Cleanup function for progressive loading
    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl, onError, convertToHls, createHlsInstance]);

  // Video event handlers for position management
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      console.log('Video: Play event');
      
      // If we have a saved position from network issues, restore it
      if (savedPosition > 0 && video.currentTime < 2) {
        console.log('Restoring saved position on manual play:', savedPosition);
        video.currentTime = savedPosition;
        setSavedPosition(0);
      }
    };

    const handlePlaying = () => {
      console.log('Video: Playing');
      setIsLoading(false);
      setIsNetworkDown(false);
      
      // If we have a saved position and we're playing after a network issue, restore it
      if (savedPosition > 0 && Math.abs(video.currentTime - savedPosition) > 2) {
        console.log('Restoring position during playback:', savedPosition);
        video.currentTime = savedPosition;
        setSavedPosition(0);
      }
    };

    const handlePause = () => {
      // Save position when paused in case of network issues
      setSavedPosition(video.currentTime);
    };

    const handleWaiting = () => {
      console.log('Video: Buffering...');
      setIsLoading(true);
    };

    const handleStalled = () => {
      console.log('Video: Stalled - network or buffer issue');
      setIsLoading(true);
      
      // Save current state for recovery
      const currentPosition = video.currentTime;
      const wasPlaying = !video.paused;
      
      setSavedPosition(currentPosition);
      setWasPlayingBeforeStall(wasPlaying);
      setIsNetworkDown(true);
      
      console.log('Video: Saved state during stall - position:', currentPosition, 'wasPlaying:', wasPlaying);
    };

    const handleError = (e) => {
      console.error('Video: Playback error:', e);
      setIsLoading(false);
      
      // Save position before error handling
      const currentPosition = video.currentTime;
      if (currentPosition > 0) {
        setSavedPosition(currentPosition);
        setWasPlayingBeforeStall(!video.paused);
      }
      
      onError?.('Video playback error');
    };

    // Add event listeners
    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('error', handleError);
    };
  }, [savedPosition, onError]);

  // Initialize HLS when URL changes
  useEffect(() => {
    if (videoUrl) {
      initializeHls();
    }
    
    return cleanupHls;
  }, [videoUrl, initializeHls, cleanupHls]);

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
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        style={{
          // Force hardware acceleration for smooth playback
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          perspective: 1000,
        }}
      />
      
      {/* Loading overlay with spinner */}
      {(isLoading || isAutoResuming) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
          <div className="flex items-center space-x-3 text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span>
              {isAutoResuming ? 'Auto-resuming...' : 'Loading HLS stream...'}
            </span>
          </div>
        </div>
      )}
      
      {/* Stream mode indicator */}
      <div className="absolute top-2 left-2 bg-blue-600 bg-opacity-70 text-white text-xs px-2 py-1 rounded">
        {videoUrl?.includes('.m3u8') ? 'HLS Stream' : 
         videoUrl?.includes('/stream/remux.mp4') ? 'Remux MP4' : 
         videoUrl?.includes('/stream/simple/') ? 'Progressive' : 'Stream'}
      </div>
      
      {/* Network issue indicator */}
      {isNetworkDown && (
        <div className="absolute top-2 right-2 bg-red-600 bg-opacity-90 text-white text-xs px-2 py-1 rounded flex items-center space-x-1">
          <div className="w-2 h-2 bg-red-300 rounded-full animate-pulse"></div>
          <span>Network Issue</span>
        </div>
      )}
      
      {/* Buffer health indicator */}
      {bufferHealth > 0 && !isNetworkDown && (
        <div className="absolute top-8 right-2 bg-green-600 bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          Buffer: {Math.round(bufferHealth)}%
        </div>
      )}
      
      {/* Saved position indicator */}
      {savedPosition > 0 && (
        <div className="absolute bottom-16 left-2 bg-yellow-600 bg-opacity-90 text-white text-xs px-2 py-1 rounded">
          Saved at {Math.floor(savedPosition / 60)}:{(savedPosition % 60).toFixed(0).padStart(2, '0')}
        </div>
      )}
    </div>
  );
};

export default SimplePlayer;