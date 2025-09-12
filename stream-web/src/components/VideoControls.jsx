import { useState, useEffect } from 'react';

const VideoControls = ({ videoRef, className = "" }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoRef]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (direction, amount) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = Math.max(0, Math.min(duration, currentTime + (direction * amount)));
    video.currentTime = newTime;
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  if (!duration) return null;

  return (
    <div className={`bg-black bg-opacity-80 text-white p-4 rounded-lg ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleSeek(-1, 10)}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded text-sm transition-colors"
            title="Rewind 10s"
          >
            ⏪ 10s
          </button>
          <button
            onClick={togglePlayPause}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition-colors"
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>
          <button
            onClick={() => handleSeek(1, 10)}
            className="bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded text-sm transition-colors"
            title="Forward 10s"
          >
            10s ⏩
          </button>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => handleSeek(-1, 600)}
            className="bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded text-sm transition-colors"
            title="Rewind 10min"
          >
            ⏪ 10m
          </button>
          <button
            onClick={() => handleSeek(1, 600)}
            className="bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded text-sm transition-colors"
            title="Forward 10min"
          >
            10m ⏩
          </button>
        </div>
      </div>
      
      <div className="w-full bg-gray-600 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-200"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />
      </div>
    </div>
  );
};

export default VideoControls;