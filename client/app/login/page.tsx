'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '../../store/useGameStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const router = useRouter();
  const { changePassword } = useGameStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        localStorage.setItem('user', JSON.stringify(result.user));
        if (result.token) {
            localStorage.setItem('session_token', result.token);
        }

        if (result.user.role === 'SUPERADMIN') {
          router.push('/');
        } else {
          router.push('/otp');
        }
      } else {
        if (result.code === 'CHANGE_PASSWORD_REQUIRED') {
            setShowChangePassword(true);
            setError('Please change your password to continue.');
        } else {
            setError(result.message || 'Login failed');
        }
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
          setError("Passwords do not match");
          return;
      }
      setLoading(true);
      setError('');

      const result = await changePassword({ username, oldPassword: password, newPassword });
      setLoading(false);

      if (result.success) {
          alert("Password changed successfully. Please login with your new password.");
          setShowChangePassword(false);
          setPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setError('');
      } else {
          setError(result.message || 'Error occurred');
      }
  };

  if (showChangePassword) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black">
          <form onSubmit={handleChangePassword} className="p-8 bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-96">
            <h1 className="text-xl font-bold text-center mb-6 text-yellow-400">CHANGE PASSWORD REQUIRED</h1>

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 p-2 rounded mb-4 text-xs text-center">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-black/50 border border-gray-700 p-2 rounded text-white focus:border-cyan-500 outline-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-black/50 border border-gray-700 p-2 rounded text-white focus:border-cyan-500 outline-none"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
              >
                {loading ? 'UPDATING...' : 'UPDATE PASSWORD'}
              </button>
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded transition-colors disabled:opacity-50 text-xs"
              >
                CANCEL
              </button>
            </div>
          </form>
        </div>
      );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <form onSubmit={handleLogin} className="p-8 bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-96">
        <h1 className="text-2xl font-bold text-center mb-6 text-cyan-400">COMMAND HUB LOGIN</h1>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-2 rounded mb-4 text-xs text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 p-2 rounded text-white focus:border-cyan-500 outline-none"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 p-2 rounded text-white focus:border-cyan-500 outline-none"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'AUTHENTICATING...' : 'ENTER'}
          </button>
        </div>
      </form>
    </div>
  );
}
