'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '../../store/useGameStore';

export default function OTPPage() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { verifyOtp, connect } = useGameStore();

  useEffect(() => {
    // Ensure socket connection
    connect();
  }, [connect]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        const result = await verifyOtp(otp);
        if (result.success) {
             // Update local storage
             localStorage.setItem('user', JSON.stringify(result.user));
             router.push('/');
        } else {
            setError(result.message || 'Verification Failed');
        }
    } catch {
        setError('Connection Error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <form onSubmit={handleVerify} className="p-8 bg-gray-900 border border-red-500 rounded-lg shadow-[0_0_30px_rgba(220,38,38,0.3)] w-96 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse" />

        <h1 className="text-2xl font-bold text-center mb-6 text-red-500 tracking-widest">AUTHENTICATION REQUIRED</h1>

        {error && (
            <div className="mb-4 p-2 bg-red-900/20 border border-red-800 text-red-400 text-xs text-center font-mono">
                {error.toUpperCase()}
            </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] text-red-300 mb-2 tracking-[0.2em] uppercase">Security Clearance Code</label>
            <input
              type="text"
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full bg-black/50 border border-red-800 p-3 rounded text-red-500 text-center tracking-[1em] text-3xl focus:border-red-500 outline-none font-mono placeholder-red-900/30 transition-all focus:bg-black/80"
              placeholder="0000"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 4}
            className="w-full bg-red-900/50 hover:bg-red-800 border border-red-600 text-red-200 font-bold py-3 rounded transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-95"
          >
            {loading ? 'VERIFYING...' : 'VERIFY ACCESS'}
          </button>
        </div>
      </form>
    </div>
  );
}
