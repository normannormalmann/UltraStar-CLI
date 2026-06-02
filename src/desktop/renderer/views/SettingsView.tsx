import type { FC } from "react";
import type { AppConfig } from "../../shared/ipc-contract.ts";

export const SettingsView: FC<{
  initialConfig: AppConfig | null;
  version: string;
}> = () => <h2>Einstellungen</h2>;

export default SettingsView;
