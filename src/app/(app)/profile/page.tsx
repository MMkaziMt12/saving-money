"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from 'date-fns';
import { Camera, Edit3, Mail, Phone, User, Shield, CalendarDays, Loader2, Save } from "lucide-react";
import { useState, type FormEvent, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types"; // Ensure Profile type is correctly defined

export default function ProfilePage() {
  const { user, profile, isLoading: authLoading, fetchProfile, setProfile: setAuthProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    avatar_url: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        avatar_url: profile.avatar_url || "",
      });
      setAvatarPreview(profile.avatar_url || null);
    }
  }, [profile]);

  if (authLoading || !user || !profile) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };

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
    if (!user) return;
    setIsSaving(true);

    let newAvatarUrl = profile.avatar_url;

    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`; // Added Date.now() for uniqueness
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars') // Using 'avatars' bucket as per existing setup
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) {
        toast({ title: "Upload Failed", description: uploadError.message, variant: "destructive" });
        setIsSaving(false);
        return;
      }
      
      if(uploadData?.path) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
        newAvatarUrl = urlData.publicUrl;
      }
    }

    const updates: Partial<Profile> = {
      id: user.id,
      full_name: formData.full_name,
      phone: formData.phone,
      avatar_url: newAvatarUrl,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else if (data) {
      setAuthProfile(data); 
      toast({ title: "Profile Updated", description: "Your profile information has been saved." });
      setIsEditing(false);
      setAvatarFile(null); 
    }
    setIsSaving(false);
  };
  
  const joinedAtDate = profile.joined_at ? parseISO(profile.joined_at) : new Date();
  const currentAvatarSrc = avatarPreview || formData.avatar_url;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader className="border-b">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-primary/50 shadow-md">
                <AvatarImage 
                  src={currentAvatarSrc || undefined} 
                  alt={profile.full_name || "User"} 
                  data-ai-hint={currentAvatarSrc ? "person profile" : "profile placeholder"} 
                />
                <AvatarFallback className="text-4xl">{getInitials(profile.full_name)}</AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button asChild variant="outline" size="icon" className="absolute bottom-2 right-2 rounded-full bg-background hover:bg-muted h-8 w-8 cursor-pointer">
                  <Label htmlFor="avatar-upload" className="cursor-pointer">
                    <Camera className="h-4 w-4" />
                    <span className="sr-only">Change photo</span>
                    <Input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} disabled={isSaving}/>
                  </Label>
                </Button>
              )}
            </div>
            <div className="text-center md:text-left">
              <CardTitle className="text-3xl font-bold">{profile.full_name || "N/A"}</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-1">{user.email}</CardDescription>
              <Badge variant={profile.role === 'admin' ? 'destructive' : 'secondary'} className="mt-2 capitalize">
                {profile.role}
              </Badge>
            </div>
            {!isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)} className="ml-auto mt-4 md:mt-0">
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
                <Input id="full_name" name="full_name" value={formData.full_name} onChange={handleInputChange} disabled={isSaving} />
              </div>
              <div>
                <Label htmlFor="phone" className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-muted-foreground" />Phone</Label>
                <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} disabled={isSaving} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setIsEditing(false); setAvatarFile(null); setAvatarPreview(profile.avatar_url || null); }} disabled={isSaving}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6 text-sm">
              <InfoItem icon={User} label="Full Name" value={profile.full_name || "N/A"} />
              <InfoItem icon={Mail} label="Email" value={user.email || "N/A"} />
              <InfoItem icon={Phone} label="Phone" value={profile.phone || "N/A"} />
              <InfoItem icon={Shield} label="Account Status" value={profile.is_approved ? "Approved" : "Pending Approval"} valueClass={profile.is_approved ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"} />
              <InfoItem icon={CalendarDays} label="Joined At" value={format(joinedAtDate, "MMMM dd, yyyy")} />
              {!currentAvatarSrc && (
                <div className="flex items-center p-3 bg-muted/50 rounded-md">
                    <Camera className="h-5 w-5 text-muted-foreground mr-3" />
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

function InfoItem({ icon: Icon, label, value, valueClass }: InfoItemProps) {
  return (
    <div className="flex items-center">
      <Icon className="h-5 w-5 text-muted-foreground mr-3" />
      <span className="font-medium w-32 text-foreground/80">{label}:</span>
      <span className={cn("text-foreground", valueClass)}>{value}</span>
    </div>
  );
}

// This Badge component is defined locally, ensure it doesn't conflict if you have a global ui/badge
// function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: string, className?: string }) {
//   const baseStyle = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors";
//   let variantStyle = "bg-secondary text-secondary-foreground";
//   if (variant === "destructive") variantStyle = "bg-destructive text-destructive-foreground";
//   if (variant === "primary") variantStyle = "bg-primary text-primary-foreground";
  
//   return <span className={cn(baseStyle, variantStyle, className)}>{children}</span>;
// }
// Using the global Badge from ui/badge, so removing local definition.
