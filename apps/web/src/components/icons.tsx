import {
  Activity,
  Bell,
  Box,
  Bug,
  Cloud,
  CreditCard,
  Database,
  Gauge,
  GitBranch,
  Globe,
  Layers,
  type LucideIcon,
  Mail,
  MessageCircle,
  MessageSquare,
  Share2,
  ShoppingBag,
  Table,
  Terminal,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import type { EndpointIcon } from "@inb/shared";
import { GithubIcon } from "./brand-icons.tsx";

export const ENDPOINT_ICON: Record<EndpointIcon, LucideIcon> = {
  webhook: Webhook,
  "git-branch": GitBranch,
  "shopping-bag": ShoppingBag,
  terminal: Terminal,
  globe: Globe,
  zap: Zap,
  "credit-card": CreditCard,
  mail: Mail,
  bell: Bell,
  box: Box,
};

/** lucide names used by the integration catalog (`@inb/shared` catalog.ts) */
const BY_NAME: Record<string, LucideIcon> = {
  "message-square": MessageSquare,
  "message-circle": MessageCircle,
  users: Users,
  bug: Bug,
  gauge: Gauge,
  activity: Activity,
  bell: Bell,
  cloud: Cloud,
  database: Database,
  table: Table,
  layers: Layers,
  github: GithubIcon as unknown as LucideIcon,
  zap: Zap,
  "share-2": Share2,
  globe: Globe,
  terminal: Terminal,
};

export function iconByName(name: string): LucideIcon {
  return BY_NAME[name] ?? Globe;
}
