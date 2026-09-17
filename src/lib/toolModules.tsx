// What the tools workbench contains, separated from the order it renders in.
//
// The reference codes stay bound to the tool, not to the slot: the clipboard
// module already shipped as "A-09" while sitting seventh in the grid, so a
// reordered layout must not renumber anything.

import type { ReactNode } from "react";
import {
  AppWindow,
  ArrowLeftRight,
  Bug,
  Camera,
  Clipboard,
  Keyboard,
  Link2,
  PackageOpen,
  Video,
} from "lucide-react";
import { CurrentAppActionsTool } from "@/components/ActivityMonitor";
import { ApkTool } from "@/components/AppManager";
import { BugReportTool } from "@/components/BugReportTool";
import { ClipboardTool } from "@/components/ClipboardTool";
import { DeepLinkTool } from "@/components/DeepLinkTool";
import { PortForwardTool } from "@/components/PortForwardTool";
import { QuickKeysTool } from "@/components/QuickKeys";
import { ScreenRecordTool } from "@/components/ScreenRecordTool";
import { ScreenshotTool } from "@/components/Screenshot";
import type { Messages } from "@/i18n";
import type { ToolModuleId } from "@/lib/toolLayout";

/** Whether the tools pane is the visible workspace, forwarded to polling tools. */
export interface ToolModuleContext {
  active: boolean;
}

export interface ToolModuleDefinition {
  id: ToolModuleId;
  reference: string;
  wide?: boolean;
  icon: () => ReactNode;
  // A getter rather than a resolved string: a module-scope translation would
  // freeze the catalog that was active when this file first loaded.
  title: (t: Messages) => string;
  render: (context: ToolModuleContext) => ReactNode;
}

// Keyed by id so TypeScript rejects a module that is declared but never
// registered, and a registration with no matching id.
export const TOOL_MODULES: Readonly<Record<ToolModuleId, ToolModuleDefinition>> = {
  screenshot: {
    id: "screenshot",
    reference: "A-01",
    icon: () => <Camera />,
    title: (t) => t.shell.modules.screenshot,
    render: () => <ScreenshotTool />,
  },
  recording: {
    id: "recording",
    reference: "A-02",
    icon: () => <Video />,
    title: (t) => t.shell.modules.recording,
    render: ({ active }) => <ScreenRecordTool active={active} />,
  },
  install: {
    id: "install",
    reference: "A-03",
    icon: () => <PackageOpen />,
    title: (t) => t.shell.modules.install,
    render: ({ active }) => <ApkTool active={active} />,
  },
  deeplink: {
    id: "deeplink",
    reference: "A-04",
    icon: () => <Link2 />,
    // Product name, deliberately outside the catalog.
    title: () => "Deep Link",
    render: () => <DeepLinkTool />,
  },
  ports: {
    id: "ports",
    reference: "A-05",
    wide: true,
    icon: () => <ArrowLeftRight />,
    title: (t) => t.shell.modules.ports,
    render: ({ active }) => <PortForwardTool active={active} />,
  },
  keys: {
    id: "keys",
    reference: "A-06",
    icon: () => <Keyboard />,
    title: (t) => t.shell.modules.keys,
    render: () => <QuickKeysTool />,
  },
  clipboard: {
    id: "clipboard",
    reference: "A-09",
    icon: () => <Clipboard />,
    title: (t) => t.shell.modules.clipboard,
    render: () => <ClipboardTool />,
  },
  currentApp: {
    id: "currentApp",
    reference: "A-07",
    icon: () => <AppWindow />,
    title: (t) => t.shell.modules.currentApp,
    render: () => <CurrentAppActionsTool />,
  },
  bugReport: {
    id: "bugReport",
    reference: "A-08",
    icon: () => <Bug />,
    title: (t) => t.shell.modules.bugReport,
    render: () => <BugReportTool />,
  },
};
