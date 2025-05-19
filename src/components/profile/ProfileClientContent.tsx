
"use client";

import React, { useState, type FormEvent, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from 'date-fns';
import { Camera, Edit3, Mail, Phone, User, Shield, CalendarDays, Loader2, Save, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client"; 
import type { Profile } from "@/types"; 
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// Removed fetchUserProfileFromServer import as profile comes from useAuth or a specific query if needed for refresh
// import { useAuthStore } from "@/stores/authStore"; // For directly calling profile update action

interface ProfileClientContentProps {
  initialProfile: Profile | null; // Passed from server component
}

export function ProfileClientContent({ initialProfile: ssrProfile }: ProfileClientContentProps) {
  const { user, profile: authProfile, isLoadingAuth, fetchProfile } = useAuth(); // Use the new hook
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  // The profile from useAuth should be the source of truth.
  // ssrProfile is for the very initial render before client hydration completes.
  const displayProfile = authProfile || ssrProfile;

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    avatar_url: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (displayProfile) {
      setFormData({
        full_name: displayProfile.full_name || "",
        phone: displayProfile.phone || "",
        avatar_url: displayProfile.avatar_url || "",
      });
      setAvatarPreview(displayProfile.avatar_url || null);
    }
  }, [displayProfile]);
  
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { full_name: string; phone: string; avatarFile?: File | null }) => {
      if (!user?.id) throw new Error("User not authenticated.");
      
      let newAvatarUrl = displayProfile?.avatar_url;
      const isGoogleLogin = user?.app_metadata?.provider === 'google';

      if (updates.avatarFile && !isGoogleLogin) {
        const file = updates.avatarFile;
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('profile-pic')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;
        if(uploadData?.path) {
          const { data: urlData } = supabase.storage.from('profile-pic').getPublicUrl(uploadData.path);
          newAvatarUrl = urlData.publicUrl;
        }
      }

      const dbUpdates: Partial<Profile> = {
        id: user.id,
        full_name: updates.full_name,
        phone: updates.phone,
        updated_at: new Date().toISOString(),
      };
      
      // Only update avatar_url if it changed AND it's not a Google login with an existing Google avatar,
      // or if there was no avatar before.
      if (newAvatarUrl !== displayProfile?.avatar_url && (!isGoogleLogin || !displayProfile?.avatar_url?.startsWith('https://lh3.googleusercontent.com'))) {
        dbUpdates.avatar_url = newAvatarUrl;
      }
      
      const { data: updatedProfileData, error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', user.id)
        .select("id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login")
        .single<Profile>();

      if (error) throw error;
      return updatedProfileData;
    },
    onSuccess: (updatedProfileData) => {
      if (updatedProfileData) {
        // Update the Zustand store
        // useAuthStore.getState().setProfile(updatedProfileData);
        // useAuthStore.getState().setUser({ ...user!, profile: updatedProfileData } as any); // Update user in store too
        
        toast({ title: "Profile Updated", description: "Your profile information has been saved." });
        setIsEditing(false);
        setAvatarFile(null);
        // Optionally invalidate TanStack queries if other components use a separate query for profile
        queryClient.invalidateQueries({ queryKey: ["userProfile", user?.id] }); 
      }
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ ...formData, avatarFile });
  };
  
  if (isLoadingAuth && !displayProfile) { // Show loader if auth is loading and no profile (initial or auth) is ready
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!user || !displayProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Profile not available or user not authenticated.</p>
        <Button onClick={() => user && fetchProfile(user.id, true)} variant="outline" disabled={!user}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try Refreshing Profile
        </Button>
      </div>
    );
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1 && names[0]) return names[0][0].toUpperCase();
    if (names.length > 1 && names[0] && names[names.length -1])
      return (names[0][0].toUpperCase() || "") + (names[names.length - 1][0].toUpperCase() || "");
    return "U";
  };
  
  const joinedAtDate = displayProfile.created_at ? parseISO(displayProfile.created_at) : new Date();
  const currentAvatarSrc = avatarPreview || formData.avatar_url;
  const isGoogleLogin = user?.app_metadata?.provider === 'google';

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-primary/50 shadow-md">
                <AvatarImage 
                  src={currentAvatarSrc || undefined} 
                  alt={displayProfile.full_name || "User"} 
                  data-ai-hint={currentAvatarSrc ? "person profile" : "profile placeholder"} 
                />
                <AvatarFallback className="text-3xl sm:text-4xl">{getInitials(displayProfile.full_name)}</AvatarFallback>
              </Avatar>
              {isEditing && !isGoogleLogin && (
                <Button asChild variant="outline" size="icon" className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 rounded-full bg-background hover:bg-muted h-8 w-8 cursor-pointer">
                  <Label htmlFor="avatar-upload" className="cursor-pointer">
                    <Camera className="h-4 w-4" />
                    <span className="sr-only">Change photo</span>
                    <Input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} disabled={updateProfileMutation.isPending}/>
                  </Label>
                </Button>
              )}
            </div>
            <div className="text-center sm:text-left flex-1">
              <CardTitle className="text-2xl sm:text-3xl font-bold">{displayProfile.full_name || "N/A"}</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-1">{user.email}</CardDescription>
              <Badge variant={displayProfile.role === 'admin' ? 'destructive' : 'secondary'} className="mt-2 capitalize">
                {displayProfile.role}
              </Badge>
            </div>
            {!isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)} className="mt-4 sm:mt-0 sm:ml-auto">
                <Edit3 className="mr-2 h-4 w-4" /> Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="full_name" className="flex items-center gap-2 mb-1"><User className="h-4 w-4 text-muted-foreground" />Full Name</Label>
                <Input id="full_name" name="full_name" value={formData.full_name} onChange={handleInputChange} disabled={updateProfileMutation.isPending} />
              </div>
              <div>
                <Label htmlFor="phone" className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-muted-foreground" />Phone</Label>
                <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} disabled={updateProfileMutation.isPending} />
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setIsEditing(false); setAvatarFile(null); if(displayProfile) setAvatarPreview(displayProfile.avatar_url || null); }} disabled={updateProfileMutation.isPending} className="w-full sm:w-auto">Cancel</Button>
                <Button type="submit" disabled={updateProfileMutation.isPending} className="w-full sm:w-auto">
                  {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-sm">
              <InfoItem icon={User} label="Full Name" value={displayProfile.full_name || "N/A"} />
              <InfoItem icon={Mail} label="Email" value={user.email || "N/A"} />
              <InfoItem icon={Phone} label="Phone" value={displayProfile.phone || "N/A"} />
              <InfoItem icon={Shield} label="Account Status" value={displayProfile.is_approved ? "Approved" : "Pending Approval"} valueClass={displayProfile.is_approved ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"} />
              <InfoItem icon={CalendarDays} label="Account Created" value={format(joinedAtDate, "MMMM dd, yyyy")} />
              {!currentAvatarSrc && !isGoogleLogin && (
                <div className="flex items-center p-3 bg-muted/50 rounded-md text-xs">
                    <Camera className="h-4 w-4 text-muted-foreground mr-2" />
                    <span className="text-muted-foreground">You can add a profile picture by editing your profile.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface InfoItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClass?: string;
}

const InfoItem = React.memo(({ icon: Icon, label, value, valueClass }: InfoItemProps) => {
  return (
    <div className="flex items-center py-2 border-b last:border-b-0">
      <Icon className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
      <span className="font-medium w-28 sm:w-32 text-foreground/80 shrink-0">{label}:</span>
      <span className={cn("text-foreground break-words", valueClass)}>{value}</span>
    </div>
  );
});
InfoItem.displayName = "InfoItem";
