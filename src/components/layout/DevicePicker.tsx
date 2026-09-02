import { useMemo } from "react";
import {
  BlueprintSelect,
  type BlueprintSelectOption,
} from "@/components/BlueprintSelect";
import {
  getDeviceBySerial,
  getDeviceLabel,
  getDeviceStateLabel,
  getSelectableDevices,
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
  return getSelectableDevices(devices).map((device) => ({
    value: device.serial,
    label: `${getDeviceLabel(device)}, ${device.serial}, ${getDeviceStateLabel(device.state)}`,
  }));
}

export function DevicePicker() {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const setSelectedDevice = useDeviceStore((state) => state.setSelectedDevice);
  const selectableDevices = useMemo(() => getSelectableDevices(devices), [devices]);
  const options = useMemo(() => getDevicePickerOptions(devices), [devices]);

  function optionDevice(option: BlueprintSelectOption | null): DeviceInfo | null {
    return getDeviceBySerial(selectableDevices, option?.value ?? null);
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
          const device = optionDevice(option);
          if (!device) {
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
          return (
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn("h-[7px] w-[7px] shrink-0", statusSquareClass(device.state))}
              />
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
          const device = optionDevice(option);
          if (!device) {
            return <span className="truncate">{option.label}</span>;
          }
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
              <span className="shrink-0 font-data text-[10.5px] text-ink3">
                {getDeviceStateLabel(device.state)}
              </span>
            </>
          );
        }}
      />
    </div>
  );
}
