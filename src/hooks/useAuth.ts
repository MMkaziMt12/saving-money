"use client";

import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext'; // Assuming AuthContext.tsx is in contexts folder
import type { AuthContextType as ImportedAuthContextType } from '@/contexts/AuthContext';

export type UseAuthReturn = ImportedAuthContextType;

export const useAuth = (): UseAuthReturn => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.error("useAuth must be used within an AuthProvider. AuthContext was undefined.");
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
