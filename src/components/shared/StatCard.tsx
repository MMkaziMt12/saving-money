
"use client";

import React from "react"; // Added React import for React.memo
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ElementType;
  description?: string;
  actionLink?: string;
  actionText?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  cardClassName?: string;
  iconClassName?: string;
  titleClassName?: string;
  valueClassName?: string;
  descriptionClassName?: string;
}

export const StatCard = React.memo(function StatCard({
  title,
  value,
  icon: Icon,
  description,
  actionLink,
  actionText,
  valuePrefix = title.toLowerCase().includes("amount") || title.toLowerCase().includes("savings") || title.toLowerCase().includes("balance") || title.toLowerCase().includes("dues") ? CURRENCY_SYMBOL : "",
  valueSuffix,
  cardClassName,
  iconClassName = "text-primary",
  titleClassName,
  valueClassName,
  descriptionClassName,
}: StatCardProps) {
  return (
    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out", cardClassName)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className={cn("text-sm font-medium text-muted-foreground", titleClassName)}>
          {title}
        </CardTitle>
        {Icon && <Icon className={cn("h-5 w-5", iconClassName)} />}
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold text-foreground", valueClassName)}>
          {valuePrefix}
          {typeof value === 'number' ? value.toLocaleString() : value}
          {valueSuffix}
        </div>
        {description && (
          <p className={cn("text-xs text-muted-foreground pt-1", descriptionClassName)}>
            {description}
          </p>
        )}
        {actionLink && actionText && (
          <Button asChild variant="link" className="px-0 pt-2 text-sm text-primary hover:text-primary/80">
            <Link href={actionLink}>
              {actionText} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
});
StatCard.displayName = "StatCard";
