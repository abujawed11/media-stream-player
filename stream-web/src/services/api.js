import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const streamApi = {
  // Smart streaming - automatically detects codecs and chooses best approach
  startSmartStream: async (remoteUrl) => {
    try {
      const response = await api.post('/stream/smart/start', { 
        url: remoteUrl 
      });
      
      if (response.data.ok) {
        return {
          success: true,
          sessionId: response.data.sessionId,
          videoUrl: `${API_BASE_URL}${response.data.videoUrl}`,
          mode: response.data.mode,
          reason: response.data.reason,
          audioCodec: response.data.audioCodec,
        };
      } else {
        throw new Error(response.data.error || 'Failed to start smart stream');
      }
    } catch (error) {
      console.error('Smart Stream API Error:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Network error',
      };
    }
  },

  startSimpleStream: async (remoteUrl) => {
    try {
      const response = await api.post('/stream/simple/start', { 
        url: remoteUrl 
      });
      
      if (response.data.ok) {
        return {
          success: true,
          sessionId: response.data.sessionId,
          videoUrl: `${API_BASE_URL}${response.data.videoUrl}`,
        };
      } else {
        throw new Error(response.data.error || 'Failed to start stream');
      }
    } catch (error) {
      console.error('Stream API Error:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Network error',
      };
    }
  },

  // Remux streaming for smooth progressive playback
  startRemuxStream: async (remoteUrl) => {
    try {
      // Use the existing remux endpoint - no session creation needed
      const streamUrl = `${API_BASE_URL}/stream/remux.mp4?url=${encodeURIComponent(remoteUrl)}`;
      
      return {
        success: true,
        sessionId: 'remux-' + Date.now(), // Generate a dummy session ID
        streamUrl: streamUrl,
      };
    } catch (error) {
      console.error('Remux API Error:', error);
      return {
        success: false,
        error: error.message || 'Remux streaming failed',
      };
    }
  },

  // Keep old HLS method for backward compatibility
  startHlsStream: async (remoteUrl) => {
    try {
      const response = await api.post('/stream/hls/start', { 
        url: remoteUrl 
      });
      
      if (response.data.ok) {
        return {
          success: true,
          sessionId: response.data.sessionId,
          hlsUrl: `${API_BASE_URL}${response.data.hlsUrl}`,
        };
      } else {
        throw new Error(response.data.error || 'Failed to start stream');
      }
    } catch (error) {
      console.error('Stream API Error:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Network error',
      };
    }
  },

  stopStream: async (sessionId) => {
    try {
      await api.post(`/stream/hls/stop/${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error('Stop stream error:', error);
      return { success: false, error: error.message };
    }
  },
};

export default api;