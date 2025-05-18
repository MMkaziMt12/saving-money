// This file is deprecated and replaced by src/stores/authStore.ts and src/hooks/useAuth.ts
// Please delete this file from your project.

// "use client"; // Keeping this structure to avoid breaking existing imports immediately, but it should be removed.

// import type { ReactNode, Dispatch, SetStateAction } from "react";
// import {
//   createContext,
//   useContext,
// } from "react";
// import type { Profile, AuthenticatedUser as AppUser } from "@/types";


// interface AuthContextType {
//   user: AppUser | null;
//   profile: Profile | null;
//   isLoadingAuth: boolean;
//   isAuthenticated: boolean;
//   isAdmin: boolean;
//   isApproved: boolean;
//   setProfileState: Dispatch<SetStateAction<Profile | null>>; // Renamed for clarity if used
//   publicFetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
//   signOut: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextType | undefined>(undefined);

// export const AuthProvider = ({ children }: { children: ReactNode }) => {
//   console.warn("AuthProvider from AuthContext.tsx is deprecated. Use Zustand's authStore and ClientAuthInitializer instead.");
//   return <>{children}</>;
// };

// export const useAuth = (): AuthContextType => {
//   const context = useContext(AuthContext);
//   if (context === undefined) {
//     // This will likely throw an error now as the provider is removed or non-functional.
//     // Components should import useAuth from '@/hooks/useAuth.ts'
//     console.error("useAuth (from deprecated AuthContext.tsx) was called outside of its Provider. Ensure you are using the new useAuth from '@/hooks/useAuth.ts'.");
//     // Return a dummy structure to avoid immediate crashes, but this indicates a problem.
//     return {
//         user: null,
//         profile: null,
//         isLoadingAuth: true,
//         isAuthenticated: false,
//         isAdmin: false,
//         isApproved: false,
//         setProfileState: () => {},
//         publicFetchProfile: async () => null,
//         signOut: async () => {},
//     } as AuthContextType;
//   }
//   return context;
// };

// // It's highly recommended to delete this file after updating all imports to use the new Zustand-based useAuth hook.
// // Keeping it temporarily with warnings can help identify components that haven't been updated yet.
// // For a clean break, simply make this file empty or delete it.
// // For the purpose of this update, I will empty it to signify its removal.

export {}; // This file is deprecated and should be deleted. Auth logic moved to Zustand.
