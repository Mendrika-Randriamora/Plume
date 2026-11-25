import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { useSettings } from "@/core/settings/SettingsProvider";
import {
  Activity as LucideActivity,
  ArrowLeft as LucideArrowLeft,
  ArrowLeftRight as LucideArrowLeftRight,
  CheckCircle2 as LucideCheckCircle2,
  ChevronDown as LucideChevronDown,
  ChevronRight as LucideChevronRight,
  ChevronUp as LucideChevronUp,
  Cpu as LucideCpu,
  Download as LucideDownload,
  FileText as LucideFileText,
  Folder as LucideFolder,
  FolderOpen as LucideFolderOpen,
  Grid3X3 as LucideGrid3X3,
  HardDrive as LucideHardDrive,
  Home as LucideHome,
  Info as LucideInfo,
  Loader2 as LucideLoader2,
  Lock as LucideLock,
  MemoryStick as LucideMemoryStick,
  Package as LucidePackage,
  PackageCheck as LucidePackageCheck,
  Palette as LucidePalette,
  PanelLeftClose as LucidePanelLeftClose,
  PanelLeftOpen as LucidePanelLeftOpen,
  Plus as LucidePlus,
  Power as LucidePower,
  PowerOff as LucidePowerOff,
  RefreshCw as LucideRefreshCw,
  RotateCcw as LucideRotateCcw,
  RotateCw as LucideRotateCw,
  Search as LucideSearch,
  Settings as LucideSettings,
  ShieldCheck as LucideShieldCheck,
  Sparkles as LucideSparkles,
  Square as LucideSquare,
  SquarePlay as LucideSquarePlay,
  Trash2 as LucideTrash2,
  X as LucideX,
} from "lucide-react";
import {
  Activity as SketchyActivity,
  ArrowLeft as SketchyArrowLeft,
  ArrowLeftRight as SketchyArrowLeftRight,
  CheckCircle2 as SketchyCheckCircle2,
  ChevronDown as SketchyChevronDown,
  ChevronRight as SketchyChevronRight,
  ChevronUp as SketchyChevronUp,
  Cpu as SketchyCpu,
  Download as SketchyDownload,
  FileText as SketchyFileText,
  Folder as SketchyFolder,
  FolderOpen as SketchyFolderOpen,
  Grid3X3 as SketchyGrid3X3,
  HardDrive as SketchyHardDrive,
  Home as SketchyHome,
  Info as SketchyInfo,
  Loader2 as SketchyLoader2,
  Lock as SketchyLock,
  MemoryStick as SketchyMemoryStick,
  Package as SketchyPackage,
  PackageCheck as SketchyPackageCheck,
  Palette as SketchyPalette,
  PanelLeftClose as SketchyPanelLeftClose,
  PanelLeftOpen as SketchyPanelLeftOpen,
  Plus as SketchyPlus,
  Power as SketchyPower,
  PowerOff as SketchyPowerOff,
  RefreshCw as SketchyRefreshCw,
  RotateCcw as SketchyRotateCcw,
  RotateCw as SketchyRotateCw,
  Search as SketchySearch,
  Settings as SketchySettings,
  ShieldCheck as SketchyShieldCheck,
  Sparkles as SketchySparkles,
  Square as SketchySquare,
  SquarePlay as SketchySquarePlay,
  Trash2 as SketchyTrash2,
  X as SketchyX,
} from "@sketchyicons/react";

export type AppIconProps = LucideProps;
export type AppIcon = ComponentType<AppIconProps>;

/**
 * Icône de l'interface, résolue selon la bibliothèque choisie dans les
 * réglages (`settings.iconLibrary`) : Sketchy ou Lucide.
 */
export function Activity(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyActivity : LucideActivity;
  return <Icon {...props} />;
}

export function ArrowLeft(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyArrowLeft : LucideArrowLeft;
  return <Icon {...props} />;
}

export function ArrowLeftRight(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyArrowLeftRight : LucideArrowLeftRight;
  return <Icon {...props} />;
}

export function CheckCircle2(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyCheckCircle2 : LucideCheckCircle2;
  return <Icon {...props} />;
}

export function ChevronDown(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyChevronDown : LucideChevronDown;
  return <Icon {...props} />;
}

export function ChevronRight(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyChevronRight : LucideChevronRight;
  return <Icon {...props} />;
}

export function ChevronUp(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyChevronUp : LucideChevronUp;
  return <Icon {...props} />;
}

export function Cpu(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyCpu : LucideCpu;
  return <Icon {...props} />;
}

export function Download(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyDownload : LucideDownload;
  return <Icon {...props} />;
}

export function FileText(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyFileText : LucideFileText;
  return <Icon {...props} />;
}

export function Folder(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyFolder : LucideFolder;
  return <Icon {...props} />;
}

export function FolderOpen(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyFolderOpen : LucideFolderOpen;
  return <Icon {...props} />;
}

export function Grid3X3(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyGrid3X3 : LucideGrid3X3;
  return <Icon {...props} />;
}

export function HardDrive(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyHardDrive : LucideHardDrive;
  return <Icon {...props} />;
}

export function Home(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyHome : LucideHome;
  return <Icon {...props} />;
}

export function Info(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyInfo : LucideInfo;
  return <Icon {...props} />;
}

export function Loader2(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyLoader2 : LucideLoader2;
  return <Icon {...props} />;
}

export function Lock(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyLock : LucideLock;
  return <Icon {...props} />;
}

export function MemoryStick(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyMemoryStick : LucideMemoryStick;
  return <Icon {...props} />;
}

export function Package(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPackage : LucidePackage;
  return <Icon {...props} />;
}

export function PackageCheck(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPackageCheck : LucidePackageCheck;
  return <Icon {...props} />;
}

export function Palette(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPalette : LucidePalette;
  return <Icon {...props} />;
}

export function PanelLeftClose(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPanelLeftClose : LucidePanelLeftClose;
  return <Icon {...props} />;
}

export function PanelLeftOpen(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPanelLeftOpen : LucidePanelLeftOpen;
  return <Icon {...props} />;
}

export function Plus(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPlus : LucidePlus;
  return <Icon {...props} />;
}

export function Power(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPower : LucidePower;
  return <Icon {...props} />;
}

export function PowerOff(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPowerOff : LucidePowerOff;
  return <Icon {...props} />;
}

export function RefreshCw(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyRefreshCw : LucideRefreshCw;
  return <Icon {...props} />;
}

export function RotateCcw(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyRotateCcw : LucideRotateCcw;
  return <Icon {...props} />;
}

export function RotateCw(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyRotateCw : LucideRotateCw;
  return <Icon {...props} />;
}

export function Search(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchySearch : LucideSearch;
  return <Icon {...props} />;
}

export function Settings(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchySettings : LucideSettings;
  return <Icon {...props} />;
}

export function ShieldCheck(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyShieldCheck : LucideShieldCheck;
  return <Icon {...props} />;
}

export function Sparkles(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchySparkles : LucideSparkles;
  return <Icon {...props} />;
}

export function Square(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchySquare : LucideSquare;
  return <Icon {...props} />;
}

export function SquarePlay(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchySquarePlay : LucideSquarePlay;
  return <Icon {...props} />;
}

export function Trash2(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyTrash2 : LucideTrash2;
  return <Icon {...props} />;
}

export function X(props: AppIconProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyX : LucideX;
  return <Icon {...props} />;
}
