'use client';
import { useState, useEffect } from 'react';
import Layout from '../../../components/Layout';
import { useGameStore } from '../../../store/useGameStore';
import { Trash, CheckCircle, ShieldAlert, Key, Lock } from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: string;
  isBlocked: boolean;
  isVerified: boolean;
  otp?: string;
}

export default function UserManagement() {
  const { socket, addUser, deleteUser, user: currentUser } = useGameStore();
  const [users, setUsers] = useState<User[]>([]);
  const [generatedOtp, setGeneratedOtp] = useState<{userId: string, otp: string} | null>(null);
  const [passwordChangeId, setPasswordChangeId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'USER'
  });

  useEffect(() => {
    if (!socket) return;

    socket.emit('admin:get_users');

    socket.on('admin:users_data', (data: { users: User[] }) => {
      setUsers(data.users);
    });

    socket.on('admin:otp_generated', (data: { userId: string, otp: string }) => {
        setGeneratedOtp(data);
        // Auto-clear after 30 seconds
        setTimeout(() => {
            if (generatedOtp?.userId === data.userId) setGeneratedOtp(null);
        }, 30000);
    });

    return () => {
      socket.off('admin:users_data');
      socket.off('admin:otp_generated');
    };
  }, [socket, generatedOtp]);

  const handleUpdatePassword = (userId: string) => {
      if (socket && newPassword) {
          socket.emit('admin:update_password', { userId, newPassword });
          setPasswordChangeId(null);
          setNewPassword('');
          alert('Password updated');
      }
  };

  const toggleStatus = (id: string) => {
    if (socket) {
      socket.emit('admin:toggle_block', { userId: id });
    }
  };

  const handleGenerateOTP = (id: string) => {
     if (socket) {
       socket.emit('admin:generate_otp', { userId: id });
     }
  };

  const handleCreateUser = (e: React.FormEvent) => {
      e.preventDefault();
      addUser(formData);
      setFormData({ username: '', password: '', role: 'USER' });
  };

  return (
    <Layout>
      <div className="p-8 text-white h-full overflow-y-auto">
        <h1 className="text-3xl font-bold mb-8 text-cyan-400">USER MANAGEMENT</h1>

        {/* Create User Form */}
        <div className="mb-8 p-4 bg-gray-900/50 border border-gray-700 rounded-lg max-w-4xl">
            <h2 className="text-xl font-bold mb-4 text-cyan-200">ADD NEW USER</h2>
            <form onSubmit={handleCreateUser} className="flex gap-4 items-end flex-wrap">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">USERNAME</label>
                    <input
                        type="text"
                        required
                        value={formData.username}
                        onChange={e => setFormData({...formData, username: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">PASSWORD</label>
                    <input
                        type="text"
                        required
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">ROLE</label>
                    <select
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                        className="bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none w-32"
                    >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPERADMIN">SUPERADMIN</option>
                    </select>
                </div>
                <button type="submit" className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded text-white font-bold text-sm">
                    CREATE USER
                </button>
            </form>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="p-4">USERNAME</th>
              <th className="p-4">ROLE</th>
              <th className="p-4">STATUS</th>
              <th className="p-4">VERIFIED</th>
              <th className="p-4">OTP</th>
              <th className="p-4">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-gray-800 hover:bg-white/5">
                <td className="p-4 font-mono">{user.username}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.role === 'SUPERADMIN' ? 'bg-purple-900 text-purple-200' :
                    user.role === 'ADMIN' ? 'bg-blue-900 text-blue-200' : 'bg-gray-800 text-gray-300'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-4">
                  <span className={!user.isBlocked ? 'text-green-400' : 'text-red-400'}>
                    {!user.isBlocked ? 'ACTIVE' : 'BLOCKED'}
                  </span>
                </td>
                <td className="p-4">
                    {user.isVerified ?
                        <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={14}/> YES</span> :
                        <span className="flex items-center gap-1 text-gray-500 text-xs"><ShieldAlert size={14}/> NO</span>
                    }
                </td>
                <td className="p-4">
                    {generatedOtp?.userId === user.id ? (
                        <span className="font-mono text-xl text-yellow-400 tracking-widest animate-pulse">{generatedOtp.otp}</span>
                    ) : (
                        <span className="text-gray-600 text-xs">-</span>
                    )}
                </td>
                <td className="p-4 flex gap-2">
                  <button
                    onClick={() => toggleStatus(user.id)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded text-sm border border-gray-600"
                    title={user.isBlocked ? "Unblock" : "Block"}
                  >
                    {user.isBlocked ? 'UNBLOCK' : 'BLOCK'}
                  </button>
                  <button
                    onClick={() => handleGenerateOTP(user.id)}
                    className="bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 px-3 py-1 rounded text-sm border border-cyan-800/50 flex items-center gap-1"
                    title="Generate OTP"
                  >
                    <Key size={14} /> GEN OTP
                  </button>
                  {currentUser?.role === 'SUPERADMIN' && (
                      <div className="relative">
                          {passwordChangeId === user.id ? (
                              <div className="flex items-center gap-1">
                                  <input
                                      type="text"
                                      placeholder="New Pass"
                                      className="w-20 bg-black text-xs p-1 border border-gray-600 rounded"
                                      value={newPassword}
                                      onChange={e => setNewPassword(e.target.value)}
                                  />
                                  <button onClick={() => handleUpdatePassword(user.id)} className="text-green-500 text-xs font-bold">OK</button>
                                  <button onClick={() => setPasswordChangeId(null)} className="text-red-500 text-xs">X</button>
                              </div>
                          ) : (
                              <button
                                onClick={() => setPasswordChangeId(user.id)}
                                className="bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 px-3 py-1 rounded text-sm border border-yellow-800/50"
                                title="Change Password"
                              >
                                <Lock size={14} />
                              </button>
                          )}
                      </div>
                  )}
                  <button
                    onClick={() => deleteUser(user.id)}
                    className="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1 rounded text-sm border border-red-800/50"
                    title="Delete User"
                  >
                    <Trash size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
