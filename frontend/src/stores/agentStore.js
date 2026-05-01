import { create } from 'zustand';

export const useAgentStore = create((set) => ({
    logs: [],
    isRunning: false,
    addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
    setLogs: (logs) => set({ logs }),
    setIsRunning: (isRunning) => set({ isRunning }),
    clearLogs: () => set({ logs: [] }),
}));
