
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMockAuth } from "@/hooks/use-mock-auth";
import { format, parseISO } from 'date-fns';
import { Camera, Edit3, Mail, Phone, User, Shield, CalendarDays } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { user } = useMockAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    // email is usually not editable or handled differently
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading profile...</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return names[0][0].toUpperCase() + names[names.length - 1][0].toUpperCase();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Here you would call an API to update the profile
    console.log("Updated data:", formData);
    toast({
      title: "Profile Updated",
      description: "Your profile information has been saved.",
      variant: "default", // 'default' or 'success' if you add it
    });
    setIsEditing(false);
    // Potentially update user context if not handled by API response + re-fetch
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader className="border-b">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-primary/50 shadow-md">
                <AvatarImage src={user.avatar_url} alt={user.full_name} data-ai-hint="person profile" />
                <AvatarFallback className="text-4xl">{getInitials(user.full_name)}</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="icon" className="absolute bottom-2 right-2 rounded-full bg-background hover:bg-muted h-8 w-8">
                <Camera className="h-4 w-4" />
                <span className="sr-only">Change photo</span>
              </Button>
            </div>
            <div className="text-center md:text-left">
              <CardTitle className="text-3xl font-bold">{user.full_name}</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-1">{user.email}</CardDescription>
              <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="mt-2 capitalize">
                {user.role}
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
                <Input id="full_name" name="full_name" value={formData.full_name} onChange={handleInputChange} />
              </div>
              <div>
                <Label htmlFor="phone" className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-muted-foreground" />Phone</Label>
                <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6 text-sm">
              <InfoItem icon={User} label="Full Name" value={user.full_name} />
              <InfoItem icon={Mail} label="Email" value={user.email} />
              <InfoItem icon={Phone} label="Phone" value={user.phone} />
              <InfoItem icon={Shield} label="Account Status" value={user.is_approved ? "Approved" : "Pending Approval"} valueClass={user.is_approved ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"} />
              <InfoItem icon={CalendarDays} label="Joined At" value={format(parseISO(user.joined_at), "MMMM dd, yyyy")} />
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

// Helper Badge component (can be moved to ui/badge if more variants are needed)
function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: string, className?: string }) {
  const baseStyle = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors";
  let variantStyle = "bg-secondary text-secondary-foreground";
  if (variant === "destructive") variantStyle = "bg-destructive text-destructive-foreground";
  if (variant === "primary") variantStyle = "bg-primary text-primary-foreground";
  
  return <span className={cn(baseStyle, variantStyle, className)}>{children}</span>;
}
