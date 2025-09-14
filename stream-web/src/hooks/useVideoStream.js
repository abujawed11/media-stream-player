import { useState, useCallback, useRef } from 'react';
import { streamApi } from '../services/api';

export const useVideoStream = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const sessionIdRef = useRef(null);

  const startStream = useCallback(async (remoteUrl) => {
    if (!remoteUrl?.trim()) {
      setError('Please provide a valid video URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      // Use remux streaming for smooth progressive playback
      console.log('🚀 Starting remux stream for:', remoteUrl.trim());
      const result = await streamApi.startRemuxStream(remoteUrl.trim());
      
      if (result.success) {
        setSessionId(result.sessionId);
        sessionIdRef.current = result.sessionId;
        setVideoUrl(result.streamUrl);
        setError(null);
        console.log('✅ Remux stream started:', result.streamUrl);
      } else {
        // Fallback to simple streaming if remux fails
        console.log('⚠️ Remux failed, falling back to simple streaming...');
        const fallbackResult = await streamApi.startSimpleStream(remoteUrl.trim());
        
        if (fallbackResult.success) {
          setSessionId(fallbackResult.sessionId);
          sessionIdRef.current = fallbackResult.sessionId;
          setVideoUrl(fallbackResult.videoUrl);
          setError(null);
          console.log('✅ Simple stream started:', fallbackResult.videoUrl);
        } else {
          setError(fallbackResult.error || 'Failed to start video stream');
        }
      }
    } catch (err) {
      setError('Network error: Could not connect to streaming server');
      console.error('Stream start error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopStream = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await streamApi.stopStream(sessionIdRef.current);
      } catch (err) {
        console.warn('Error stopping stream:', err);
      }
    }
    
    setVideoUrl(null);
    setSessionId(null);
    sessionIdRef.current = null;
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    videoUrl,
    sessionId,
    startStream,
    stopStream,
    clearError,
  };
};