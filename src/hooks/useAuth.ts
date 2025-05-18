
"use client";

import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext'; // Assuming AuthContext.tsx is in contexts folder

// Ensure AuthContextType is imported if it's defined in AuthContext.tsx
import type { AuthContextType as ImportedAuthContextType } from '@/contexts/AuthContext';

// Re-declare or use the imported type. For simplicity, ensure AuthContextType is exported from AuthContext.tsx
// Or, redeclare the expected return structure here if preferred, but importing is better.
export type UseAuthReturn = ImportedAuthContextType; // Use the imported type

export const useAuth = (): UseAuthReturn => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // This error means useAuth is called outside of AuthProvider.
    // It's a critical setup error if it happens within the (app) layout.
    console.error("useAuth must be used within an AuthProvider. AuthContext was undefined.");
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

    