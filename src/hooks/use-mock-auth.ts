
"use client";

import type { AuthenticatedUser, UserRole } from "@/types";
import { useState, useEffect, useCallback } from "react";

interface MockAuthHook {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  login: (role: UserRole, approved?: boolean) => void;
  logout: () => void;
  cycleUserType: () => void; // Helper for development
}

const mockUsers: Record<string, AuthenticatedUser> = {
  unapprovedUser: {
    id: "user-unapproved-id",
    full_name: "Pending User",
    email: "pending@example.com",
    phone: "1234567890",
    role: "user",
    is_approved: false,
    joined_at: new Date().toISOString(),
    avatar_url: "https://picsum.photos/seed/pendingUser/100/100",
  },
  approvedUser: {
    id: "z-approved-id",
    full_name: "Sonia Sharma",
    email: "sonia.sharma@example.com",
    phone: "0987654321",
    role: "user",
    is_approved: true,
    joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // Joined a month ago
    avatar_url: "https://picsum.photos/seed/soniaSharma/100/100",
  },
  adminUser: {
    id: "admin-id",
    full_name: "Admin Manager",
    email: "admin@example.com",
    phone: "1122334455",
    role: "admin",
    is_approved: true,
    joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(), // Joined two months ago
    avatar_url: "https://picsum.photos/seed/adminManager/100/100",
  },
};

let currentUserTypeIndex = 0;
const userTypes: (AuthenticatedUser | null)[] = [
  null, // Logged out
  mockUsers.unapprovedUser,
  mockUsers.approvedUser,
  mockUsers.adminUser,
];

export function useMockAuth(): MockAuthHook {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial auth check
    const storedUserType = localStorage.getItem("mockAuthUserType");
    if (storedUserType) {
      const initialUser = JSON.parse(storedUserType) as AuthenticatedUser | null;
      setUser(initialUser);
      currentUserTypeIndex = userTypes.findIndex(u => u?.id === initialUser?.id);
      if (currentUserTypeIndex === -1 && initialUser === null) currentUserTypeIndex = 0; // for null case
    } else {
      setUser(userTypes[currentUserTypeIndex]); // Default to logged out or first user
    }
    setIsLoading(false);
  }, []);

  const updateUserState = (newUser: AuthenticatedUser | null) => {
    setUser(newUser);
    localStorage.setItem("mockAuthUserType", JSON.stringify(newUser));
  };

  const login = useCallback((role: UserRole, approved: boolean = true) => {
    setIsLoading(true);
    if (role === "admin") {
      updateUserState(mockUsers.adminUser);
    } else {
      updateUserState(approved ? mockUsers.approvedUser : mockUsers.unapprovedUser);
    }
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setIsLoading(true);
    updateUserState(null);
    currentUserTypeIndex = 0; // Reset to logged out state
    setIsLoading(false);
  }, []);

  const cycleUserType = useCallback(() => {
    setIsLoading(true);
    currentUserTypeIndex = (currentUserTypeIndex + 1) % userTypes.length;
    updateUserState(userTypes[currentUserTypeIndex]);
    setIsLoading(false);
  }, []);

  return {
    user,
    isLoading,
    isApproved: !!user?.is_approved,
    isAdmin: user?.role === "admin",
    login,
    logout,
    cycleUserType,
  };
}
