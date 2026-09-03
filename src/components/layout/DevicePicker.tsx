import { useMemo } from "react";
import { Usb, Wifi } from "lucide-react";
import {
  BlueprintSelect,
  type BlueprintSelectOption,
} from "@/components/BlueprintSelect";
import {
  activeTransports,
  getDeviceLabel,
  getDeviceStateLabel,
  getSelectableDevices,
  mergeDevicesByIdentity,
  transportKind,
  transportSummary,
  type MergedDevice,
} from "@/lib/device";
import type { DeviceInfo } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";

function statusSquareClass(state: string | null): string {
  switch (state) {
    case "device":
      return "bg-ok";
    case "unauthorized":
      return "bg-warn";
    default:
      return "bg-transparent shadow-[inset_0_0_0_1px_var(--color-ink3)]";
  }
}

export function getDevicePickerOptions(devices: DeviceInfo[]): BlueprintSelectOption[] {
  return mergeDevicesByIdentity(getSelectableDevices(devices)).map((merged) => ({
    value: merged.serial,
    label: `${getDeviceLabel(merged.primary)}, ${merged.serial}, ${getDeviceStateLabel(merged.primary.state)}, ${transportSummary(merged)}`,
  }));
}

interface TransportIconProps {
  device: DeviceInfo;
  className?: string;
}

function TransportIcon({ device, className }: TransportIconProps) {
  const Icon = transportKind(device) === "network" ? Wifi : Usb;
  return <Icon aria-hidden="true" className={className} />;
}

function TransportBadges({ merged }: { merged: MergedDevice }) {
  const primaryKind = transportKind(merged.primary);
  return (
    <span className="flex items-center gap-1">
      <span className="sr-only">{transportSummary(merged)}</span>
      {activeTransports(merged).map((device) => {
        const kind = transportKind(device);
        return (
          <TransportIcon
            key={kind}
            device={device}
            className={cn(
              "h-3 w-3",
              kind === primaryKind ? "text-ink" : "text-ink3",
            )}
          />
        );
      })}
    </span>
  );
}

export function DevicePicker() {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const setSelectedDevice = useDeviceStore((state) => state.setSelectedDevice);
  const mergedDevices = useMemo(
    () => mergeDevicesByIdentity(getSelectableDevices(devices)),
    [devices],
  );
  const options = useMemo(() => getDevicePickerOptions(devices), [devices]);

  function optionMergedDevice(option: BlueprintSelectOption | null): MergedDevice | null {
    return mergedDevices.find((merged) => merged.serial === option?.value) ?? null;
  }

  return (
    <div className="relative min-w-0 flex-1">
      <BlueprintSelect
        value={selectedDevice ?? ""}
        options={options}
        onValueChange={(nextValue) => setSelectedDevice(nextValue || null)}
        ariaLabel="选择设备"
        emptyLabel="没有检测到设备"
        disabled={options.length === 0}
        className="h-[34px] gap-2.5 bg-transparent px-3 hover:bg-hover active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-note"
        menuClassName="right-auto w-[292px] max-w-[calc(100vw-2rem)]"
        optionClassName="min-h-[52px] gap-[9px] py-[9px]"
        chevronClassName="h-[13px] w-[13px]"
        renderValue={(option) => {
          const merged = optionMergedDevice(option);
          if (!merged) {
            return (
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-[7px] w-[7px] shrink-0 bg-transparent shadow-[inset_0_0_0_1px_var(--color-ink3)]"
                />
                <span className="truncate font-sans text-[13px] font-semibold text-ink3">
                  没有检测到设备
                </span>
              </span>
            );
          }
          const device = merged.primary;
          return (
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn("h-[7px] w-[7px] shrink-0", statusSquareClass(device.state))}
              />
              <TransportIcon device={device} className="h-3 w-3 shrink-0 text-ink" />
              <span className="flex min-w-0 items-baseline gap-1.5 overflow-hidden">
                <span className="truncate font-sans text-[13px] font-semibold text-ink">
                  {getDeviceLabel(device)}
                </span>
                <span className="truncate font-data text-[11px] text-ink3">
                  {device.serial}
                </span>
              </span>
            </span>
          );
        }}
        renderOption={(option) => {
          const merged = optionMergedDevice(option);
          if (!merged) {
            return <span className="truncate">{option.label}</span>;
          }
          const device = merged.primary;
          return (
            <>
              <span
                aria-hidden="true"
                className={cn("h-[7px] w-[7px] shrink-0", statusSquareClass(device.state))}
              />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-sans text-[12.5px] font-medium text-ink">
                  {getDeviceLabel(device)}
                </span>
                <span className="mt-0.5 block truncate font-data text-[10.5px] text-ink3">
                  {device.serial}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-data text-[10.5px] text-ink3">
                  {getDeviceStateLabel(device.state)}
                </span>
                <TransportBadges merged={merged} />
              </span>
            </>
          );
        }}
      />
    </div>
  );
}
