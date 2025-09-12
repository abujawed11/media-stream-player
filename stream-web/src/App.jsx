
import { useState } from 'react';
import SimplePlayer from './components/SimplePlayer';
import { useVideoStream } from './hooks/useVideoStream';

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const { isLoading, error, videoUrl: streamVideoUrl, startStream, stopStream, clearError } = useVideoStream();

  const handleSubmit = (e) => {
    e.preventDefault();
    startStream(videoUrl);
  };

  const handleNewVideo = () => {
    stopStream();
    setVideoUrl('');
  };

  const handlePlayerError = (errorMessage) => {
    console.error('Player Error:', errorMessage);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Media Stream Player
          </h1>
          <p className="text-lg text-gray-600">
            Stream videos from remote links with simple direct streaming
          </p>
        </div>

        {!streamVideoUrl ? (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  Video URL (Seedr, Direct Links, etc.)
                </label>
                <input
                  type="url"
                  id="videoUrl"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isLoading}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !videoUrl.trim()}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Starting Stream...
                  </span>
                ) : (
                  'Start Streaming'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Streaming Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      {error}
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={clearError}
                        className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Now Playing
                  </h2>
                  <button
                    onClick={handleNewVideo}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Load New Video
                  </button>
                </div>
                
                <SimplePlayer
                  videoUrl={streamVideoUrl}
                  onError={handlePlayerError}
                  className="w-full rounded-lg shadow-lg"
                />
                
                <div className="mt-4 text-sm text-gray-500">
                  <p>• Direct streaming - no conversion required</p>
                  <p>• Zero CPU usage on server</p>
                  <p>• Instant playback with original quality</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
