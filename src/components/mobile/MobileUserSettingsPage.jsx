import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../../services/supabaseClient.js';
import { User, Save, CheckCircle, AlertCircle, Settings, Mail, Calendar, Shield, Bell, Palette } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MobileScreenManager from './MobileScreenManager';
import { MobileInput } from './MobileInput';
import MobileButton from './MobileButton';
import { cn } from '../../../lib/utils';

const MobileUserSettingsPage = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize display name from user metadata
  useEffect(() => {
    if (user) {
      const currentDisplayName = user.user_metadata?.full_name || user.user_metadata?.name || '';
      setDisplayName(currentDisplayName);
      setHasChanges(false);
    }
  }, [user]);

  // Clear message after a few seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleDisplayNameChange = (value) => {
    setDisplayName(value);
    const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    setHasChanges(value.trim() !== currentDisplayName);
    setMessage({ type: '', text: '' });
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Full name cannot be empty' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName.trim(),
          name: displayName.trim() // Keep both for backwards compatibility
        }
      });

      if (error) {
        throw error;
      }

      setMessage({
        type: 'success',
        text: 'Full name updated successfully! This will help match you with your team in the league.'
      });
      setHasChanges(false);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to update full name. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!user) {
    return (
      <MobileScreenManager
        isOpen={isOpen}
        onClose={onClose}
        title="Settings"
        className="bg-gray-50"
      >
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 mb-6">Please sign in to access user settings.</p>
          <MobileButton onClick={onClose} variant="primary" className="w-full">
            Go Back
          </MobileButton>
        </div>
      </MobileScreenManager>
    );
  }

  return (
    <MobileScreenManager
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      className="bg-gray-50"
    >
      <div className="space-y-4 p-4">
        {/* Profile Section */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
              <p className="text-sm text-gray-600">
                Update your profile details
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <MobileInput
                label="Full Name (First Last)"
                placeholder="Enter your full name (e.g., John Smith)"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                clearable
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                We use your full name to match you with your team in the league. Please use your real name as it appears in your fantasy league.
              </p>
            </div>

            <div>
              <MobileInput
                label="Email Address"
                value={user?.email || ''}
                disabled
                type="email"
              />
              <p className="text-xs text-gray-500 mt-2">
                Email cannot be changed from here. Contact support if needed.
              </p>
            </div>

            {message.text && (
              <div className={cn(
                'p-3 rounded-lg border',
                message.type === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-green-50 border-green-200'
              )}>
                <div className="flex items-center space-x-2">
                  {message.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                  <p className={cn(
                    'text-sm',
                    message.type === 'error' ? 'text-red-700' : 'text-green-700'
                  )}>
                    {message.text}
                  </p>
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <MobileButton
                onClick={handleSave}
                disabled={loading || !hasChanges}
                loading={loading}
                variant="primary"
                className="flex-1"
                icon={Save}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </MobileButton>
              {hasChanges && (
                <MobileButton
                  onClick={() => {
                    const currentDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
                    setDisplayName(currentDisplayName);
                    setHasChanges(false);
                    setMessage({ type: '', text: '' });
                  }}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </MobileButton>
              )}
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
              <p className="text-sm text-gray-600">
                View your account details
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Account Created</span>
              </div>
              <span className="text-sm text-gray-600">{formatDate(user?.created_at)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Last Sign In</span>
              </div>
              <span className="text-sm text-gray-600">{formatDate(user?.last_sign_in_at)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Email Verified</span>
              </div>
              <span className={cn(
                'text-sm font-medium',
                user?.email_confirmed_at ? 'text-green-600' : 'text-orange-600'
              )}>
                {user?.email_confirmed_at ? 'Yes' : 'No'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">User ID</span>
              </div>
              <span className="text-xs font-mono text-gray-500">
                {user?.id?.slice(0, 8)}...
              </span>
            </div>
          </div>
        </div>

        {/* Future Settings Sections */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Settings className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">More Settings</h2>
              <p className="text-sm text-gray-600">
                Additional options coming soon
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Notifications</p>
                  <p className="text-xs text-gray-500">Manage your notification preferences</p>
                </div>
              </div>
              <div className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-500">
                Soon
              </div>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <Palette className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Appearance</p>
                  <p className="text-xs text-gray-500">Customize your app appearance</p>
                </div>
              </div>
              <div className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-500">
                Soon
              </div>
            </div>

            <div className="flex justify-between items-center py-3">
              <div className="flex items-center space-x-3">
                <Shield className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Privacy</p>
                  <p className="text-xs text-gray-500">Control your privacy settings</p>
                </div>
              </div>
              <div className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-500">
                Soon
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileScreenManager>
  );
};

export default MobileUserSettingsPage;