import type { FC } from "react";
import type { DownloadedEntry } from "../../shared/ipc-contract.ts";

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = () => (
  <h2>Heruntergeladen</h2>
);

export default DownloadedView;
