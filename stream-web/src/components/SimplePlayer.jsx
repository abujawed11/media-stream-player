import { useRef, useEffect, useState } from 'react';

const SimplePlayer = ({ 
  videoUrl,
  onError,
  className = "w-full h-auto rounded-lg shadow-lg"
}) => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setIsLoading(true);

    // Simple - just set the src
    video.src = videoUrl;
    
    const handleLoadStart = () => {
      console.log('Video loading started');
      setIsLoading(true);
    };

    const handleLoadedData = () => {
      console.log('Video data loaded');
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      console.log('Video can start playing');
      setIsLoading(false);
      
      // Optimize buffering
      if (video.buffered && video.buffered.length > 0) {
        console.log('Buffer status:', video.buffered.end(0) - video.buffered.start(0));
      }
    };

    const handleProgress = () => {
      // Log buffering progress for debugging
      if (video.buffered && video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        const duration = video.duration;
        if (duration > 0) {
          const bufferPercent = (buffered / duration) * 100;
          console.log(`Buffer: ${bufferPercent.toFixed(1)}%`);
        }
      }
    };

    const handleError = (e) => {
      console.error('Video error:', e);
      setIsLoading(false);
      onError?.('Video playback error');
    };

    // Add event listeners
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('error', handleError);

    // Cleanup
    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl, onError]);

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
          // Force hardware acceleration for smoother playback
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          perspective: 1000,
        }}
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
          <div className="flex items-center space-x-3 text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span>Loading video...</span>
          </div>
        </div>
      )}
      
      <div className="absolute top-2 left-2 bg-blue-600 bg-opacity-70 text-white text-xs px-2 py-1 rounded">
        Simple Stream
      </div>
    </div>
  );
};

export default SimplePlayer;