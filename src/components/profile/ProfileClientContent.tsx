
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
import { createClient } from "@/lib/supabase/client"; // Client-side Supabase
import type { Profile } from "@/types"; 
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUserProfileFromServer } from "@/lib/api/profile";

interface ProfileClientContentProps {
  initialProfile: Profile | null;
}

export function ProfileClientContent({ initialProfile: ssrProfile }: ProfileClientContentProps) {
  const { user: authContextUser, profile: authContextProfile, isLoading: authLoading, setProfile: setAuthContextProfile, fetchProfile: fetchProfileFromContext } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient(); // Client-side Supabase for mutations

  // Prioritize context user and profile if available and loaded
  const currentUser = authContextUser;
  const currentProfileForDisplay = authLoading && !authContextProfile && ssrProfile ? ssrProfile : authContextProfile;


  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    avatar_url: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const { 
    data: queryProfile, 
    isLoading: isLoadingQueryProfile, 
    isError: isProfileError,
    error: profileErrorObj,
    refetch: refetchQueryProfile
  } = useQuery<Profile | null, Error>({
    queryKey: ["userProfile", currentUser?.id],
    queryFn: () => {
        if (!currentUser?.id) return Promise.resolve(null);
        // For client-side fetches after hydration, use the context's fetchProfile or a direct client fetch
        return fetchUserProfileFromServer(currentUser.id, supabase); // Pass client-side supabase
    },
    initialData: ssrProfile, // Use SSR data as initial data
    enabled: !!currentUser?.id && !authContextProfile, // Only run if context profile isn't loaded yet but user is
  });
  
  const profileToUse = currentProfileForDisplay || queryProfile;

  useEffect(() => {
    if (profileToUse) {
      setFormData({
        full_name: profileToUse.full_name || "",
        phone: profileToUse.phone || "",
        avatar_url: profileToUse.avatar_url || "",
      });
      setAvatarPreview(profileToUse.avatar_url || null);
    }
  }, [profileToUse]);

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Profile> & { avatarFile?: File | null }) => {
      if (!currentUser?.id) throw new Error("User not authenticated.");
      
      let newAvatarUrl = profileToUse?.avatar_url;
      const isGoogleLogin = currentUser?.app_metadata?.provider === 'google';

      if (updates.avatarFile && !isGoogleLogin) {
        const file = updates.avatarFile;
        const fileExt = file.name.split('.').pop();
        const filePath = `${currentUser.id}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('profile-pic')
          .upload(filePath, file, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }
        if(uploadData?.path) {
          const { data: urlData } = supabase.storage.from('profile-pic').getPublicUrl(uploadData.path);
          newAvatarUrl = urlData.publicUrl;
        }
      }

      const dbUpdates: Partial<Profile> = {
        id: currentUser.id,
        full_name: updates.full_name,
        phone: updates.phone,
        updated_at: new Date().toISOString(),
      };
      
      if (newAvatarUrl !== profileToUse?.avatar_url && (!isGoogleLogin || !profileToUse?.avatar_url)) {
        dbUpdates.avatar_url = newAvatarUrl;
      }
      
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', currentUser.id)
        .select("id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login")
        .single<Profile>();

      if (error) throw error;
      return updatedProfile;
    },
    onSuccess: (updatedProfile) => {
      if (updatedProfile) {
        setAuthContextProfile(updatedProfile); // Update AuthContext
        queryClient.setQueryData(["userProfile", currentUser?.id], updatedProfile); // Update TanStack Query cache
        toast({ title: "Profile Updated", description: "Your profile information has been saved." });
        setIsEditing(false);
        setAvatarFile(null);
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
  
  if (authLoading || (isLoadingQueryProfile && !profileToUse)) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (isProfileError && !profileToUse) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading profile.</p>
        <p className="text-sm text-muted-foreground mb-4">{profileErrorObj?.message || "Could not load profile information."}</p>
        <Button onClick={() => refetchQueryProfile()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  if (!currentUser || !profileToUse) {
    // This case might indicate an issue or the user is not fully authenticated/profile not found
    return (
      <div className="flex items-center justify-center h-full py-10">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="ml-4 text-lg text-muted-foreground">Profile not available.</p>
      </div>
    );
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };
  
  const joinedAtDate = profileToUse.created_at ? parseISO(profileToUse.created_at) : new Date();
  const currentAvatarSrc = avatarPreview || formData.avatar_url;
  const isGoogleLogin = currentUser?.app_metadata?.provider === 'google';

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-primary/50 shadow-md">
                <AvatarImage 
                  src={currentAvatarSrc || undefined} 
                  alt={profileToUse.full_name || "User"} 
                  data-ai-hint={currentAvatarSrc ? "person profile" : "profile placeholder"} 
                />
                <AvatarFallback className="text-3xl sm:text-4xl">{getInitials(profileToUse.full_name)}</AvatarFallback>
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
              <CardTitle className="text-2xl sm:text-3xl font-bold">{profileToUse.full_name || "N/A"}</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-1">{currentUser.email}</CardDescription>
              <Badge variant={profileToUse.role === 'admin' ? 'destructive' : 'secondary'} className="mt-2 capitalize">
                {profileToUse.role}
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
                <Button type="button" variant="outline" onClick={() => { setIsEditing(false); setAvatarFile(null); setAvatarPreview(profileToUse.avatar_url || null); }} disabled={updateProfileMutation.isPending} className="w-full sm:w-auto">Cancel</Button>
                <Button type="submit" disabled={updateProfileMutation.isPending} className="w-full sm:w-auto">
                  {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-sm">
              <InfoItem icon={User} label="Full Name" value={profileToUse.full_name || "N/A"} />
              <InfoItem icon={Mail} label="Email" value={currentUser.email || "N/A"} />
              <InfoItem icon={Phone} label="Phone" value={profileToUse.phone || "N/A"} />
              <InfoItem icon={Shield} label="Account Status" value={profileToUse.is_approved ? "Approved" : "Pending Approval"} valueClass={profileToUse.is_approved ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"} />
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

