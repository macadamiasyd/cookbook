'use client';

import { useState, useEffect, createContext, useContext } from 'react';

const TokenContext = createContext<string>('');

export function useWriteToken() {
  return useContext(TokenContext);
}

export function WriteTokenProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('write_token') ?? '';
    setToken(stored);
  }, []);

  function save() {
    localStorage.setItem('write_token', input.trim());
    setToken(input.trim());
    setShowModal(false);
  }

  return (
    <TokenContext.Provider value={token}>
      {children}
      {/* Lock button in corner */}
      <button
        onClick={() => { setInput(token); setShowModal(true); }}
        className="fixed bottom-4 right-4 text-xs px-3 py-1.5 bg-stone-200 text-stone-600 rounded-full hover:bg-stone-300 transition-colors"
        title="Set write token"
      >
        {token ? '🔓 token set' : '🔒 set token'}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h2 className="font-medium text-stone-900 mb-2">Write token</h2>
            <p className="text-xs text-stone-500 mb-4">
              Paste your WRITE_TOKEN here. It&apos;s stored in localStorage and sent with all write requests.
            </p>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="your-secret-token"
              className="w-full px-3 py-2 border border-stone-200 rounded text-sm font-mono focus:outline-none focus:border-stone-400 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 bg-stone-900 text-white rounded text-sm hover:bg-stone-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </TokenContext.Provider>
  );
}
