'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.message || '登录失败');
        return;
      }

      const data = await res.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data));
      router.push('/dashboard');
    } catch {
      setError('无法连接到服务器');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-md p-8 bg-card rounded-xl shadow-sm border">
        <h1 className="text-3xl font-bold text-center mb-1 text-foreground">RICSE</h1>
        <p className="text-muted-foreground text-center mb-6">运营管理平台</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              required
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
