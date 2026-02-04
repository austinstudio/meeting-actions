import { useState } from 'react';
import { Github } from 'lucide-react';

export default function UserMenu({ onGitHubClick, isGitHubConnected }) {
  return (
    <div className="flex items-center gap-2">
      {/* GitHub icon with tooltip */}
      <div className="relative group">
        <button 
          onClick={onGitHubClick} 
          className={`p-2 rounded-full transition-colors ${isGitHubConnected ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
          <Github size={20} />
        </button>
        {/* Tooltip */}
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          GitHub Integration
        </div>
      </div>
      {/* Other user menu items can be added here */}
    </div>
  );
}