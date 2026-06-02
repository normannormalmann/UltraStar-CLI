import { useEffect, useState } from "react";
import type {
  EventChannel,
  EventPayloads,
} from "../shared/ipc-contract.ts";

/** Abonniert einen Main-Event-Kanal; initialValue bis zum ersten Event. */
export const useIpcEvent = <C extends EventChannel>(
  channel: C,
  initialValue: EventPayloads[C],
): EventPayloads[C] => {
  const [value, setValue] = useState<EventPayloads[C]>(initialValue);
  useEffect(
    () => window.ultrastar.on(channel, setValue),
    [channel],
  );
  return value;
};
