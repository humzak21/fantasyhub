import React, { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut, ChevronDown, GitCommit, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const UserDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Loading...');
  const dropdownRef = useRef(null);
  const { user, signOut } = useAuth();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch latest GitHub commit message
  useEffect(() => {
    const fetchLatestCommit = async () => {
      try {
        console.log('Fetching latest commit from GitHub API...');
        const response = await fetch('https://api.github.com/repos/humzak21/movietracker/commits?per_page=1', {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'MovieTracker-App'
          }
        });
        
        console.log('GitHub API response status:', response.status);
        
        if (response.ok) {
          const commits = await response.json();
          console.log('GitHub API response data:', commits);
          if (commits.length > 0) {
            setCommitMessage(commits[0].commit.message);
          } else {
            setCommitMessage('No commits found');
          }
        } else {
          console.error('GitHub API response not ok:', response.status, response.statusText);
          setCommitMessage('Unable to fetch latest commit');
        }
      } catch (error) {
        console.error('Error fetching commit:', error);
        setCommitMessage('Failed to load commit message');
      }
    };

    fetchLatestCommit();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Truncate email for display in button
  const truncateEmail = (email) => {
    if (!email) return 'User';
    if (email.length > 20) {
      return email.substring(0, 17) + '...';
    }
    return email;
  };

  return (
    <div className="user-dropdown" ref={dropdownRef}>
      <button 
        className="user-dropdown-btn"
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <User size={16} />
        <span>{truncateEmail(user?.email)}</span>
        <ChevronDown 
          size={14} 
          className={`user-dropdown-chevron ${isOpen ? 'rotated' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="user-dropdown-menu">
          <div className="user-dropdown-header">
            <button 
              className="user-dropdown-item commit-message-item"
              onClick={() => {
                window.open('https://github.com/humzak21/movietracker', '_blank');
                setIsOpen(false);
              }}
            >
              <GitCommit size={16} />
              <span>{commitMessage}</span>
            </button>
          </div>
          
          <div className="user-dropdown-divider"></div>
          
          <button 
            className="user-dropdown-item"
            onClick={() => {
              window.open('TEMP_URL', '_blank');
              setIsOpen(false);
            }}
          >
            <Trophy size={16} />
            <span>Fantasy Football</span>
          </button>
          
          <button 
            className="user-dropdown-item"
            onClick={() => {
              setIsOpen(false);
              // TODO: Add settings functionality
              console.log('Settings clicked');
            }}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          
          <button 
            className="user-dropdown-item user-dropdown-signout"
            onClick={handleSignOut}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserDropdown; 